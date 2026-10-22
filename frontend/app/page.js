'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const api = async (p, o) => { const r = await fetch('/api' + p, { ...o, headers: { 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status); return r.json(); };
const Box = ({ v, children }) => !v ? <small>Loading…</small> : v.error ? <p className="err">Could not load: {v.error}</p> : children;

export default function Home() {
  const [me, setMe] = useState(undefined), [d, setD] = useState({}), [ai, setAi] = useState({}), [bm, setBm] = useState([]);
  const load = (k, p) => api(p).then(v => setD(x => ({ ...x, [k]: v }))).catch(e => setD(x => ({ ...x, [k]: { error: e.message } })));
  useEffect(() => { api('/me').then(setMe).catch(() => setMe(null)); }, []);
  useEffect(() => { if (!me) return; load('repos', '/repos'); load('act', '/activity'); load('trend', '/trending'); load('news', '/news'); api('/bookmarks').then(setBm).catch(() => {}); }, [me]);

  if (me === undefined) return <p className="hero">Loading…</p>;
  if (!me) return <div className="hero"><h1>TechPulse</h1><p>Your GitHub activity, trending repos and developer news in one place.</p><a href="/api/auth/github"><button>Sign in with GitHub</button></a></div>;

  const sum = async it => { setAi(a => ({ ...a, [it.url]: 'Summarizing…' })); try { const r = await api('/summarize', { method: 'POST', body: JSON.stringify(it) }); setAi(a => ({ ...a, [it.url]: r.summary })); } catch (e) { setAi(a => ({ ...a, [it.url]: 'Summary failed: ' + e.message })); } };
  const save = async it => { await api('/bookmarks', { method: 'POST', body: JSON.stringify(it) }); setBm(await api('/bookmarks')); };
  const del = async id => { await api('/bookmarks/' + id, { method: 'DELETE' }); setBm(b => b.filter(x => x.id !== id)); };
  const { repos, act, trend, news } = d;

  return <>
    <header><span><img src={me.avatar} alt="" />{me.login}</span><button className="ghost" style={{ color: '#fff', borderColor: '#5b6b82' }} onClick={() => api('/auth/logout', { method: 'POST' }).then(() => setMe(null))}>Sign out</button></header>
    <main>
      <section className="wide"><h2>Your repositories</h2><Box v={repos}>{repos && !repos.error && <div className="stats">
        <div><b>{repos.total}</b>repos</div><div><b>{repos.stars}</b>stars</div><div><b>{repos.forks}</b>forks</div></div>}</Box></section>
      <section><h2>Languages</h2><Box v={repos}>{repos?.languages && (repos.languages.length ? <ResponsiveContainer height={220}><BarChart data={repos.languages}><XAxis dataKey="name" fontSize={12} /><YAxis allowDecimals={false} width={28} /><Tooltip /><Bar dataKey="count" fill="#0f9d8a" radius={4} /></BarChart></ResponsiveContainer> : <small>No repositories with a detected language yet.</small>)}</Box></section>
      <section><h2>Commits per day</h2><Box v={act}>{Array.isArray(act) && (act.length ? <ResponsiveContainer height={220}><LineChart data={act}><XAxis dataKey="date" fontSize={11} /><YAxis allowDecimals={false} width={28} /><Tooltip /><Line dataKey="commits" stroke="#e9a23b" strokeWidth={2} /></LineChart></ResponsiveContainer> : <small>No push events in GitHub's recent event window.</small>)}</Box></section>
      <section><h2>Trending this week</h2><Box v={trend}><ul>{Array.isArray(trend) && trend.map(r => <li key={r.name}><a href={r.url} target="_blank" rel="noreferrer"><b>{r.name}</b></a> <small>★ {r.stars} · {r.language || 'n/a'}</small><br /><small>{r.description}</small></li>)}</ul></Box><small>GitHub has no official trending API. This lists repos created in the last 7 days, sorted by stars.</small></section>
      <section><h2>Bookmarks</h2>{bm.length ? <ul>{bm.map(b => <li key={b.id}><a href={b.url} target="_blank" rel="noreferrer">{b.title}</a> <button className="ghost" onClick={() => del(b.id)}>Remove</button></li>)}</ul> : <small>Nothing saved yet. Use Save on any article.</small>}</section>
      <section className="wide"><h2>News and discussions</h2>
        {news?.status && <small>Sources: {Object.entries(news.status).map(([k, v]) => `${k}: ${v}`).join(' | ')}</small>}
        <Box v={news}><ul>{news?.items?.map(it => <li key={it.url}><a href={it.url} target="_blank" rel="noreferrer">{it.title}</a> <small>{it.source}</small><br />
          <button className="ghost" onClick={() => sum(it)}>Summarize with AI</button> <button className="ghost" onClick={() => save(it)}>Save</button>
          {ai[it.url] && <div className="ai"><small>AI-generated</small><br />{ai[it.url]}</div>}</li>)}</ul></Box></section>
    </main></>;
}
