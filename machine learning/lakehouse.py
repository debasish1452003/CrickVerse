"""
CrickVerse lakehouse access for ML.

The silver layer is partitioned Parquet written by the TypeScript pipeline
(`pnpm --filter @crickverse/worker cricsheet-export-parquet all`). This module is
the Python entry point: it opens DuckDB over those Parquet files so you can pull
the full ball-by-ball corpus (~11M deliveries) into pandas/Polars/NumPy for
training — no database, no server, just files.

    from lakehouse import connect, deliveries_sql
    con = connect()
    df = con.sql(f"SELECT * FROM {deliveries_sql()} WHERE match_class='T20I'").df()

Set LAKEHOUSE_SILVER to override the default ../data/lakehouse/silver path.
"""

from __future__ import annotations

import os

import duckdb

_HERE = os.path.dirname(os.path.abspath(__file__))
SILVER = os.environ.get("LAKEHOUSE_SILVER", os.path.join(_HERE, "..", "data", "lakehouse", "silver"))


def _glob(path: str) -> str:
    return path.replace("\\", "/")


def deliveries_sql() -> str:
    """A read_parquet(...) expression over the partitioned delivery corpus (Hive cols restored)."""
    return f"read_parquet('{_glob(os.path.join(SILVER, 'deliveries', '**', '*.parquet'))}', hive_partitioning=true)"


def matches_sql() -> str:
    return f"read_parquet('{_glob(os.path.join(SILVER, 'matches.parquet'))}')"


def players_sql() -> str:
    return f"read_parquet('{_glob(os.path.join(SILVER, 'players.parquet'))}')"


def connect() -> duckdb.DuckDBPyConnection:
    """An in-memory DuckDB connection with `deliveries`, `matches`, `players` views ready."""
    con = duckdb.connect()
    con.sql(f"CREATE VIEW deliveries AS SELECT * FROM {deliveries_sql()}")
    con.sql(f"CREATE VIEW matches AS SELECT * FROM {matches_sql()}")
    con.sql(f"CREATE VIEW players AS SELECT * FROM {players_sql()}")
    return con


if __name__ == "__main__":
    con = connect()
    print("Silver dir:", SILVER)
    print("Deliveries:", con.sql("SELECT count(*) FROM deliveries").fetchone()[0])
    print("Matches:   ", con.sql("SELECT count(*) FROM matches").fetchone()[0])
    print("Players:   ", con.sql("SELECT count(*) FROM players").fetchone()[0])
    print("\nBy class:")
    print(con.sql("SELECT match_class, count(*) balls FROM deliveries GROUP BY 1 ORDER BY 2 DESC").df())
