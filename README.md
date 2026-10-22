# TechPulse
Next.js (3000) -> Express + Prisma (4000) -> FastAPI + Gemini (8000), PostgreSQL via Docker.

## Setup
1. `cp .env.example .env`, phir NAYE keys bharo (purane leaked keys use mat karo).
2. GitHub OAuth app: Homepage `http://localhost:3000`, Callback `http://localhost:3000/api/auth/github/callback`.
3. `docker compose up -d`
4. Backend: `cd backend && cp ../.env .env && npm i && npx prisma migrate dev --name init && npm run dev`
5. AI: `cd ai && pip install -r requirements.txt && uvicorn main:app --port 8000`
6. Frontend: `cd frontend && npm i && npm run dev`, phir http://localhost:3000 kholo.

## Limitations
- "Trending" = pichhle 7 din me bani repos, stars ke hisaab se (GitHub ka official API nahi hai).
- Activity GitHub events se aati hai (~90 din / 300 events).
- AI summary sirf title/snippet par based hai, poora article nahi padhta.
- NewsAPI free plan sirf localhost par chalta hai.
- Reddit, cron workers aur FastAPI recommendations abhi nahi bane. News 10 min in-memory cache hoti hai.
