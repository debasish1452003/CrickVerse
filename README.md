# CrickVerse

Cricket analytics platform: an automated ESPNCricinfo scraping pipeline, a Cricsheet-backed
historical/ML dataset, and a Next.js web app — built as a **pnpm + Turborepo monorepo**.

> **Status:** mid-pivot on branch `feat/monorepo-pivot`. Everything that doesn't need the
> database is built and verified. Bringing it to life needs a **Neon Postgres** connection
> string (see [Setup](#setup)). Legacy `backend/` (Express) and `frontend/` (CRA) remain until
> the Phase 8 cutover.

## Architecture

```
apps/
  web/        Next.js (App Router). Postgres is the BFF — Server Components read Prisma
              directly; route handlers only for auth, mutations, live updates.
  worker/     Long-running Node service: cron scheduler + scraping/ingest jobs.
packages/
  types/      Zod schemas + inferred types — the cross-package contract.
  scraper-core/  The scraping engine (see below). No DB/queue coupling (dependency-injected).
  db/         Prisma schema + client singleton + repositories + entity resolver.
```

**The scraper is descriptor-driven.** Each ESPNCricinfo page type is one `SourceDescriptor`
(`buildUrl → extract → parse → validate → discover`). `discover()` emits the next URLs to crawl,
so seeding a series fans out to its matches → scorecards automatically. Adding coverage = add one
descriptor. The fetcher is rate-limited (shared p-queue), retries with backoff, rotates
User-Agents, and caches every raw `__NEXT_DATA__` payload as a `RawSnapshot` (re-parse without
re-fetching).

**Two ID namespaces, one canonical row.** Entities use `cuid()` PKs; ESPNCricinfo `objectId`s and
Cricsheet registry ids map in via per-entity `*ExternalId` tables, so both sources resolve to the
same Player/Team/Venue/Series/Match. `Delivery` (ball-by-ball, from Cricsheet) is the flat ML
feature table.

## Tech stack

Next.js (App Router) · React 19 · Prisma + Postgres (Neon) · Auth.js v5 + Google (Phase 8) ·
TypeScript · Zod · axios + cheerio · node-cron · Turborepo · Vitest.

## Setup

Prereqs: Node ≥ 20, pnpm (`npm i -g pnpm`).

```bash
pnpm install
cp .env.example .env            # then edit .env (below)
pnpm db:generate                # generate the Prisma client
```

Edit `.env` (gitignored):

- `DATABASE_URL` — Neon **pooled** connection string (host contains `-pooler`).
- `DIRECT_URL`   — Neon **direct** string (same host without `-pooler`); used by migrations.
- `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — only needed for auth (Phase 8).

Then create the schema and run:

```bash
pnpm db:migrate                 # create tables on Neon
pnpm db:seed                    # register IPL 2026 as a scrape source
pnpm --filter @crickverse/worker run seed ipl-2026 1510719   # scrape -> Postgres
pnpm --filter @crickverse/web dev                            # http://localhost:3000
```

## Common commands

| Command | What it does |
|---|---|
| `pnpm typecheck` / `pnpm test` | Typecheck all packages / run unit tests |
| `pnpm --filter @crickverse/worker run probe <slug> <id>` | Fetch + parse a series, **no DB writes** ("does this URL parse?") |
| `pnpm --filter @crickverse/worker run seed <slug> <id> [LIVE\|HISTORICAL]` | Crawl a series into Postgres |
| `pnpm --filter @crickverse/worker start` | Run the cron scheduler (live + backfill ticks) |
| `pnpm db:studio` | Browse the database |

## Adding a series to scrape

1. Find it on espncricinfo.com; the URL is `/series/<slug>-<objectId>/...`.
2. Validate it parses: `pnpm --filter @crickverse/worker run probe <slug> <objectId>`.
3. Add it as a source (DB row) so the scheduler tracks it — via `upsertScrapeSource` /
   the seed script — then `seed` it or let the scheduler pick it up.

## Roadmap

- [x] **0–4** Monorepo, types, scraper-core (golden tests 10/10), Prisma data model
- [x] **6** Scorecard parser (live-verified)
- [x] **7** Cron scheduler (live + backfill) — *player-profile descriptor still TODO*
- [ ] **5/6 runtime** migrate + seed + render (needs Neon `DATABASE_URL`)
- [ ] **8** shadcn/ui polish + Auth.js Google + favorites/dashboard + SSE live; remove legacy apps
- [ ] **9** Cricsheet historical/ball-by-ball backfill
- [ ] **later** Python FastAPI ML service over `Delivery`
