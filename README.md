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
same Player/Team/Venue/Series/Match. Cricsheet is the canonical open ball-by-ball source: the full
corpus is exported to Parquet for ML, while Postgres stores app-facing gold summaries, scorecards,
coverage windows, and enrichment.

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
pnpm db:seed                    # register IPL 2026 + full/recent Cricsheet feeds
pnpm --filter @crickverse/worker run seed ipl-2026 1510719   # scrape -> Postgres
pnpm --filter @crickverse/worker run cricsheet:export all     # Cricsheet -> Parquet silver
pnpm --filter @crickverse/worker run cricsheet:gold           # Parquet silver -> Postgres gold
pnpm --filter @crickverse/web dev                            # http://localhost:3000
```

## Common commands

| Command | What it does |
|---|---|
| `pnpm typecheck` / `pnpm test` | Typecheck all packages / run unit tests |
| `pnpm --filter @crickverse/worker run probe <slug> <id>` | Fetch + parse a series, **no DB writes** ("does this URL parse?") |
| `pnpm --filter @crickverse/worker run seed <slug> <id> [LIVE\|HISTORICAL]` | Crawl a series into Postgres |
| `pnpm --filter @crickverse/worker run cricsheet:seed-feeds` | Register default Cricsheet feeds (`all`, `recently`) |
| `pnpm --filter @crickverse/worker run cricsheet:export all` | Build the full available open ball-by-ball Parquet corpus |
| `pnpm --filter @crickverse/worker run cricsheet:gold` | Rebuild app-facing career/match/coverage summaries from Parquet |
| `pnpm --filter @crickverse/worker run lakehouse:refresh` | Conditional full archive refresh + gold/over rebuild |
| `pnpm --filter @crickverse/worker start` | Run the cron scheduler (live + backfill ticks) |
| `pnpm db:studio` | Browse the database |

## Historical data policy

Cricsheet is treated as the legal/open source of truth for ball-by-ball analytics. Its coverage is
excellent for modern cricket but not universal for older careers, so player pages label the exact
Cricsheet coverage window per format and do not present those analytics as official complete career
totals. Optional official totals can be imported into `OfficialCareerStat` and displayed separately
from ball-by-ball-derived `CareerStat` rows.

For enterprise-scale historical backfills, use a local Postgres database plus `data/lakehouse`
Parquet. Keep the raw ball-by-ball corpus in Parquet and put only compact gold summaries,
coverage audits, source manifests, and official totals in Postgres. The Next.js app should use the
pooled `DATABASE_URL`; long-running worker backfills, migrations, and bulk rebuilds should use a
direct/local database connection to avoid serverless pooler resets.

Legal/manual official totals can be imported from CSV or JSON:

```bash
pnpm --filter @crickverse/worker exec tsx src/cli.ts official-stats-import ./data/imports/official-careers.csv --source=MANUAL --license="Your source/license note" --dry-run
pnpm --filter @crickverse/worker exec tsx src/cli.ts official-stats-import ./data/imports/official-careers.csv --source=MANUAL --license="Your source/license note"
pnpm --filter @crickverse/worker exec tsx src/cli.ts coverage-audit
```

Importer columns: `cricsheetId` or `cricinfoId`, `matchClass`, `matches`, `runs`, `wickets`,
`battingAvg`, `bowlingAvg`, and optional `sourceUrl`. Every non-dry run records a `SourceImport`
manifest with file path, checksum, source, license/notes, row counts, and coverage metadata.

ESPNcricinfo historical recovery is available for public scorecards only. It stores raw HTML and
metadata under `data/recovery/cricinfo/` and parsed scorecard-level facts in `HistoricalScorecard`.
It does not create ball-by-ball data.

```bash
tsx apps/worker/src/cli.ts cricinfo-historical-discover --from-cricsheet-missing
tsx apps/worker/src/cli.ts cricinfo-historical-discover --format=TEST --from-year=1877 --to-year=1999
tsx apps/worker/src/cli.ts cricinfo-historical-discover --format=ODI --from-year=1971 --to-year=1999
tsx apps/worker/src/cli.ts cricinfo-historical-discover --format=ODI --wikipedia-title="List of highest individual scores in One Day International cricket"
tsx apps/worker/src/cli.ts cricinfo-historical-discover --format=ODI --seed-url=https://en.wikipedia.org/wiki/List_of_One_Day_International_cricket_records
tsx apps/worker/src/cli.ts cricinfo-historical-sync --manifest=data/recovery/cricinfo/manifests/MANIFEST.json --limit=3 --dry-run
tsx apps/worker/src/cli.ts cricinfo-historical-sync --manifest=data/recovery/cricinfo/manifests/MANIFEST.json --limit=25 --delay-ms=3000
```

The recovery scraper stops or backs off on blocked responses such as `403`, `429`, captcha, or
access-denied pages. Remaining gaps are reported instead of silently treated as complete.

## Adding a series to scrape

1. Find it on espncricinfo.com; the URL is `/series/<slug>-<objectId>/...`.
2. Validate it parses: `pnpm --filter @crickverse/worker run probe <slug> <objectId>`.
3. Add it as a source (DB row) so the scheduler tracks it — via `upsertScrapeSource` /
   the seed script — then `seed` it or let the scheduler pick it up.

## Roadmap

- [x] **0–4** Monorepo, types, scraper-core (golden tests 10/10), Prisma data model
- [x] **6** Scorecard parser (live-verified)
- [x] **7** Cron scheduler (live + backfill) + player-profile persistence
- [ ] **5/6 runtime** migrate + seed + render (needs Neon `DATABASE_URL`)
- [ ] **8** shadcn/ui polish + Auth.js Google + favorites/dashboard + SSE live; remove legacy apps
- [x] **9** Cricsheet historical/ball-by-ball lakehouse backfill path
- [ ] **later** Python FastAPI ML service over `Delivery`
