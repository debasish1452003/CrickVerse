# Data-completeness runbook

How CrickVerse builds **one complete cricket corpus** — Cricsheet ball-by-ball
(~2002→today) merged with per-player **pre-2000 history** recovered from
ESPNcricinfo Statsguru — and turns it into a versioned ML training set. All
storage is local (`data/lakehouse`, a few GB up to ~10GB).

## The hard facts this design respects

- **Ball-by-ball does not exist before ~1996.** It was never recorded. So
  "complete pre-2000" can only ever mean **scorecard / innings-level** data.
- **Cricsheet ball-by-ball is effectively 2002→** for internationals.
- Therefore old careers (e.g. Tendulkar, 1989→2013) are: *ball-by-ball from
  ~2002 (Cricsheet)* + *innings-level before that (Statsguru)*. That is the most
  complete record that exists anywhere.

We **never sum across sources**. Each is shown for what it is:

| Source | Table | Role in the merge |
|---|---|---|
| Statsguru per-innings | `PlayerInningsHistory` | **Complete career** (headline), incl. pre-2000 |
| Cricsheet ball-by-ball | `CareerStat` / `CareerMatch` | Labelled **analytical sample** |
| Official totals (manual) | `OfficialCareerStat` | Authoritative cross-check |

## Pipelines

### A. Cricsheet (open, runs anywhere — e.g. GitHub Actions)
```
npm -w @crickverse/worker run cricsheet:sync        # incremental ball-by-ball → Neon
npm -w @crickverse/worker run cricsheet:export      # → silver Parquet
npm -w @crickverse/worker run cricsheet:gold        # silver → gold (Neon)
```

### B. Pre-2000 recovery (drip — run on your RESIDENTIAL IP)
ESPNcricinfo blocks datacenter/cloud IPs harder than residential, so run this on
your own machine (Task Scheduler), **not** in cloud CI.

```
# one-time: know what's missing
npm -w @crickverse/worker run cricsheet:missing                       # → CoverageGap

# validate the parser on ONE player first (35320 = Tendulkar)
npm -w @crickverse/worker run recover:player-careers -- --cricinfo-id=35320 --limit=1

# daily drip (small batch; stops itself on any 403/429/captcha)
npm -w @crickverse/worker run recover:player-careers -- --limit=30 --delay-ms=4000
```
Raw HTML is cached under `data/recovery/statsguru/`, so re-parsing never re-fetches.
The queue is durable — missed days just resume; prominent (old) players come first.

### C. ML corpus (local, no network)
```
npm -w @crickverse/worker run historical:export-silver   # PlayerInningsHistory → silver/player_innings.parquet (tier=scorecard)
npm -w @crickverse/worker run ml:features                # silver ball-by-ball → data/lakehouse/ml/features (partitioned by class)
```
`build-ml-features` is **ball-grain only**; the scorecard-level historical innings
are kept in their own `player_innings.parquet` and must only feed scorecard-grain
models — mixing the two would corrupt the features.

### Progress / honesty check
```
npm -w @crickverse/worker run coverage:audit
```
Reports per-class match coverage, official-vs-derived gaps, and recovery progress
(`playerInnings`: rows, players recovered, date span, pre-Cricsheet rows).

## Scheduling the drip (Windows)

`scripts/recover-daily.ps1` runs one polite batch. Register it once:

```powershell
# from the repo root, in an elevated PowerShell
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PWD\apps\worker\scripts\recover-daily.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At 3am
Register-ScheduledTask -TaskName "CrickVerse pre-2000 recovery" -Action $action -Trigger $trigger
```

Because the queue is durable and idempotent, it's safe to miss days, run twice,
or stop mid-run. Internationals (a few thousand players) drain in weeks at
`--limit=30`; raise the limit once you trust it.

## First-time setup
```
npm -w @crickverse/db run migrate -- --name add_player_innings_history   # create PlayerInningsHistory
```
