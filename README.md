# OutreachPilot

An AI sales-outreach platform that takes you from a blank "niche + city" to a
working pipeline: **source → qualify → write outreach → follow up → close.**
Built with Next.js 14 (App Router) + SQLite, powered by Claude and/or Gemini.

## What it does

- **Source leads** from real APIs — Google Places & OpenStreetMap (local
  businesses), RemoteOK & AI Research (companies). No key? Sources fall back to
  simulated data so the UI always works.
- **Qualify** leads with AI (decision-maker, exact gap, contact, pitch) — or
  promote any lead manually.
- **Draft outreach** (email, WhatsApp, call script) personalized to each lead,
  with one-click Gmail / WhatsApp send links.
- **Chase** — marking a lead "contacted" auto-schedules a follow-up; the
  Dashboard "Today" list and a sidebar badge make sure nothing is forgotten.
- **Close** — capture deal value, delivery partner, and commission on a win; log
  win/loss reasons.
- **Measure** — funnel, source ROI (reply/win % per source), pipeline value,
  commission, time-to-close, and per-task AI spend with budgets (API Management).

Two **modules** scope the whole app: **Local** (businesses you fulfil) and
**International** (companies you broker to delivery partners).

## Quick start

```bash
npm install
cp .env.local.example .env.local   # add ANTHROPIC_API_KEY (or GEMINI_API_KEY)
npm run dev                         # http://localhost:3000
```

The SQLite DB is created automatically at `./data/outreach.db` on first run
(override with `OUTREACH_DB_PATH`). Schema migrations are additive and run on
startup — **restart the dev server after pulling schema changes** (the DB
connection is cached for the process).

## Configuration

- **AI providers & per-task routing:** Settings → API Management. Each task
  (find / qualify / write / research / copilot) runs on exactly one provider;
  set per-provider USD budgets and track spend.
- **Login:** Settings → Security (scrypt-hashed password, HMAC session cookie).
- **Branding:** Settings → Branding (name + accent color, white-label).
- See `.env.local.example` for every supported key (all sources optional).

## Project layout

```
app/            Routes (pages) + app/api/* route handlers
app/components/ UI components + design-system layer (theme, charts, Brand)
lib/            Server logic: db.js, anthropic.js (LLM gateway), agents.js,
                analytics.js, sources/* (lead adapters), auth*, aiTasks.js
scripts/        smoke.mjs — end-to-end health check
```

## Smoke test

With the dev server running and login set to the configured credentials:

```bash
node scripts/smoke.mjs            # checks auth + key routes return 200
```

## Notes

- Single-user, local-first by design. Usage attribution uses
  `AsyncLocalStorage` so concurrent AI calls don't cross-contaminate.
- Spend figures are **estimates** from list pricing (caching/taxes differ from
  the real invoice). Anchor the budget to your real console balance to track
  "remaining."
