# CrickVerse — Machine Learning

The training corpus is the **silver lakehouse**: ~11M ball-by-ball deliveries
across every format and league (Test/ODI/T20I/First-class/List A/T20 leagues…),
stored as partitioned **Parquet** and queried with **DuckDB** — free, local, no
database or server.

## Setup

```bash
# 1. Build the corpus (from the repo root, one time + nightly increments):
pnpm --filter @crickverse/worker cricsheet-export-parquet all
#    → writes data/lakehouse/silver/{deliveries/**, matches.parquet, players.parquet}

# 2. Python env:
cd "machine learning"
python -m venv .venv && . .venv/Scripts/activate   # Windows; use bin/activate on macOS/Linux
pip install -r requirements.txt

# 3. Smoke-test the data access + run the example model:
python lakehouse.py                 # prints corpus counts
python example_win_probability.py   # trains a chase win-probability model
```

Override the corpus location with `LAKEHOUSE_SILVER=/path/to/silver`.

## What's here

- **`lakehouse.py`** — opens DuckDB over the Parquet and exposes `deliveries`,
  `matches`, `players` views. `connect()` returns a ready connection; pull any
  slice into pandas/Polars with `con.sql("…").df()`.
- **`example_win_probability.py`** — end-to-end example: builds per-ball chase
  state with DuckDB window functions, labels by match result, trains a
  gradient-boosted classifier.

## Delivery columns (the feature grain)

`match_id, match_class, match_type, gender, season, event_name, venue, city,
match_date, innings_no, batting_team, bowling_team, over_no, ball_in_over,
batter_id, batter_cricinfo, batter_name, bowler_id, bowler_cricinfo, bowler_name,
non_striker_id, non_striker_name, runs_batter, runs_extras, runs_total,
extra_type, is_wicket, dismissal_kind, player_out_id, player_out_name, fielders`

`match_class` and `season` are Hive partition columns. `*_cricinfo` is the
ESPNcricinfo id (join key), present for ~18k reconciled players.

## Notes

- Cricsheet (ODbL) covers ~2003→present ball-by-ball; older careers are partial
  there (the app's gold layer can be supplemented with ESPNcricinfo aggregates).
- Career aggregates for the website live in Postgres (gold); for ML, prefer the
  raw silver deliveries here so you control the feature engineering.
