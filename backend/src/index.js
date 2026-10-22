import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const E = process.env, db = new PrismaClient(), app = express();
app.use(express.json()); app.use(cookieParser());
const key = crypto.createHash('sha256').update(E.TOKEN_ENC_KEY || '').digest();
const enc = t => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const b = Buffer.concat([c.update(t, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), b].map(x => x.toString('base64')).join('.'); };
const dec = s => { const [iv, tag, b] = s.split('.').map(x => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(b), d.final()]).toString('utf8'); };
const ck = { httpOnly: true, sameSite: 'lax', secure: E.NODE_ENV === 'production', path: '/' };
const gh = async (p, t) => { const r = await fetch('https://api.github.com' + p,
  { headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('GitHub ' + r.status); return r.json(); };

app.use((q, s, n) => { if (q.method !== 'GET') { const o = q.get('origin');
  if (o && o !== E.APP_URL) return s.status(403).json({ error: 'bad origin' }); } n(); });

const auth = async (q, s, n) => { const sid = q.cookies.sid;
  const ses = sid && await db.session.findUnique({ where: { id: sid }, include: { user: true } });
  if (!ses || ses.expiresAt < new Date()) return s.status(401).json({ error: 'not logged in' });
  q.user = ses.user; q.token = dec(ses.user.tokenEnc); n(); };
const wrap = f => (q, s) => f(q, s).catch(e => s.status(502).json({ error: e.message }));

app.get('/api/auth/github', (q, s) => { const st = crypto.randomBytes(16).toString('hex');
  s.cookie('oauth_state', st, { ...ck, maxAge: 600000 });
  s.redirect('https://github.com/login/oauth/authorize?' + new URLSearchParams(
    { client_id: E.GITHUB_CLIENT_ID, scope: 'read:user', state: st })); });

app.get('/api/auth/github/callback', wrap(async (q, s) => {
  if (!q.query.state || q.query.state !== q.cookies.oauth_state) return s.status(400).send('Invalid state');
  const r = await (await fetch('https://github.com/login/oauth/access_token', { method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: E.GITHUB_CLIENT_ID, client_secret: E.GITHUB_CLIENT_SECRET, code: q.query.code }) })).json();
  if (!r.access_token) return s.status(400).send('Token exchange failed');
  const u = await gh('/user', r.access_token);
  const user = await db.user.upsert({ where: { githubId: u.id },
    update: { login: u.login, avatar: u.avatar_url, tokenEnc: enc(r.access_token) },
    create: { githubId: u.id, login: u.login, avatar: u.avatar_url, tokenEnc: enc(r.access_token) } });
  const id = crypto.randomBytes(32).toString('hex');
  await db.session.create({ data: { id, userId: user.id, expiresAt: new Date(Date.now() + 7 * 864e5) } });
  s.clearCookie('oauth_state'); s.cookie('sid', id, { ...ck, maxAge: 7 * 864e5 }); s.redirect(E.APP_URL);
}));

app.post('/api/auth/logout', async (q, s) => { if (q.cookies.sid)
  await db.session.deleteMany({ where: { id: q.cookies.sid } }); s.clearCookie('sid'); s.json({ ok: true }); });
app.get('/api/me', auth, (q, s) => s.json({ login: q.user.login, avatar: q.user.avatar }));

app.get('/api/repos', auth, wrap(async (q, s) => {
  let repos = [];
  for (let p = 1; p <= 3; p++) { const r = await gh(`/user/repos?per_page=100&page=${p}&sort=pushed&affiliation=owner`, q.token);
    repos = repos.concat(r); if (r.length < 100) break; }
  const langs = {}; repos.forEach(r => r.language && (langs[r.language] = (langs[r.language] || 0) + 1));
  s.json({ total: repos.length, stars: repos.reduce((a, r) => a + r.stargazers_count, 0),
    forks: repos.reduce((a, r) => a + r.forks_count, 0),
    languages: Object.entries(langs).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8) });
}));

app.get('/api/activity', auth, wrap(async (q, s) => {
  const ev = await gh(`/users/${q.user.login}/events?per_page=100`, q.token), days = {};
  ev.filter(e => e.type === 'PushEvent').forEach(e => { const d = e.created_at.slice(0, 10);
    days[d] = (days[d] || 0) + (e.payload.size || 0); });
  s.json(Object.entries(days).map(([date, commits]) => ({ date, commits })).sort((a, b) => a.date.localeCompare(b.date)));
}));

app.get('/api/trending', auth, wrap(async (q, s) => {
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const r = await gh(`/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=10`, q.token);
  s.json(r.items.map(i => ({ name: i.full_name, url: i.html_url, stars: i.stargazers_count, description: i.description, language: i.language })));
}));

let cache = { t: 0, v: null };
app.get('/api/news', auth, async (q, s) => {
  if (Date.now() - cache.t < 600000) return s.json(cache.v);
  const hn = async () => { const ids = (await (await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')).json()).slice(0, 12);
    return (await Promise.all(ids.map(i => fetch(`https://hacker-news.firebaseio.com/v0/item/${i}.json`).then(r => r.json()))))
      .filter(x => x && x.url).map(x => ({ title: x.title, url: x.url, source: 'Hacker News' })); };
  const se = async () => { const r = await (await fetch('https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=10' + (E.STACK_KEY ? '&key=' + E.STACK_KEY : ''))).json();
    if (!r.items) throw new Error('bad response'); return r.items.map(x => ({ title: x.title.replace(/&#39;|&quot;|&amp;/g, "'"), url: x.link, source: 'Stack Overflow' })); };
  const na = async () => { if (!E.NEWS_API_KEY) throw new Error('not configured');
    const r = await (await fetch('https://newsapi.org/v2/top-headlines?category=technology&language=en&pageSize=10', { headers: { 'X-Api-Key': E.NEWS_API_KEY } })).json();
    if (!r.articles) throw new Error(r.message || 'bad response'); return r.articles.map(x => ({ title: x.title, url: x.url, source: 'NewsAPI', snippet: x.description })); };
  const res = await Promise.allSettled([hn(), se(), na()]), names = ['hackerNews', 'stackOverflow', 'newsApi'];
  const status = {}; res.forEach((r, i) => status[names[i]] = r.status === 'fulfilled' ? 'ok' : r.reason.message);
  cache = { t: Date.now(), v: { items: res.flatMap(r => r.status === 'fulfilled' ? r.value : []), status } };
  s.json(cache.v);
});

app.post('/api/summarize', auth, wrap(async (q, s) => {
  const r = await fetch(E.AI_URL + '/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q.body) });
  if (!r.ok) throw new Error('AI service ' + r.status); s.json(await r.json()); }));

app.get('/api/bookmarks', auth, async (q, s) => s.json(await db.bookmark.findMany({ where: { userId: q.user.id }, orderBy: { id: 'desc' } })));
app.post('/api/bookmarks', auth, wrap(async (q, s) => { const { url, title, source } = q.body;
  s.json(await db.bookmark.upsert({ where: { userId_url: { userId: q.user.id, url } }, update: {}, create: { userId: q.user.id, url, title, source } })); }));
app.delete('/api/bookmarks/:id', auth, async (q, s) => { await db.bookmark.deleteMany({ where: { id: +q.params.id, userId: q.user.id } }); s.json({ ok: true }); });

app.listen(E.BACKEND_PORT || 4000, () => console.log('API ready'));
