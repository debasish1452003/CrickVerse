"""
Example: 2nd-innings chase win-probability for limited-overs internationals.

End-to-end proof that the silver corpus is ML-ready: it builds per-ball chase
state (cumulative runs/wickets via DuckDB window functions), joins the match
result as the label, and trains a gradient-boosted classifier — all straight off
the Parquet, no database.

    pip install -r requirements.txt
    python example_win_probability.py
"""

from __future__ import annotations

from lakehouse import connect

FEATURE_SQL = """
WITH d AS (SELECT * FROM deliveries WHERE match_class IN ('T20I','ODI') AND batter_id IS NOT NULL),
inn1 AS (SELECT match_id, sum(runs_total) AS target FROM d WHERE innings_no = 1 GROUP BY match_id),
chase AS (
  SELECT d.match_id, d.batting_team, d.match_class,
    row_number()                       OVER w AS ball,
    sum(d.runs_total)                  OVER w AS runs,
    sum(CASE WHEN d.is_wicket THEN 1 ELSE 0 END) OVER w AS wkts
  FROM d
  WHERE d.innings_no = 2
  WINDOW w AS (PARTITION BY d.match_id ORDER BY d.over_no, d.ball_in_over
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
)
SELECT
  CASE WHEN c.match_class = 'T20I' THEN 120 ELSE 300 END         AS max_balls,
  c.ball,
  c.runs,
  c.wkts,
  10 - c.wkts                                                    AS wickets_in_hand,
  i.target + 1 - c.runs                                          AS runs_needed,
  (CASE WHEN c.match_class = 'T20I' THEN 120 ELSE 300 END) - c.ball AS balls_left,
  CASE WHEN c.match_class = 'T20I' THEN 1 ELSE 0 END             AS is_t20,
  CASE WHEN m.outcome_winner = c.batting_team THEN 1 ELSE 0 END  AS won
FROM chase c
JOIN inn1 i USING (match_id)
JOIN matches m ON m.match_id = c.match_id
WHERE m.outcome_winner IS NOT NULL
  AND i.target > 0
"""


def main() -> None:
    con = connect()
    print("building chase features from the corpus…")
    df = con.sql(FEATURE_SQL).df()
    print(f"  {len(df):,} ball-states from {df['runs'].notna().sum():,} rows")

    # required run rate (guard div-by-zero at the last ball)
    df["req_run_rate"] = df["runs_needed"] / (df["balls_left"].clip(lower=1) / 6.0)
    features = ["ball", "runs", "wkts", "wickets_in_hand", "runs_needed", "balls_left", "req_run_rate", "is_t20"]
    X, y = df[features], df["won"]

    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.metrics import accuracy_score, roc_auc_score
    from sklearn.model_selection import train_test_split

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
    model = GradientBoostingClassifier(max_depth=4, n_estimators=150)
    print("training GradientBoostingClassifier…")
    model.fit(X_tr, y_tr)

    p = model.predict_proba(X_te)[:, 1]
    print(f"\n  accuracy: {accuracy_score(y_te, (p >= 0.5).astype(int)):.3f}")
    print(f"  ROC AUC : {roc_auc_score(y_te, p):.3f}")

    print("\nfeature importances:")
    for f, imp in sorted(zip(features, model.feature_importances_), key=lambda t: -t[1]):
        print(f"  {f:16s} {imp:.3f}")

    # Illustrative: win prob for a T20I needing 40 off 24 with 6 wickets in hand.
    import pandas as pd

    scenario = pd.DataFrame(
        [{"ball": 96, "runs": 120, "wkts": 4, "wickets_in_hand": 6, "runs_needed": 40,
          "balls_left": 24, "req_run_rate": 40 / (24 / 6), "is_t20": 1}]
    )[features]
    print(f"\nT20I, need 40 off 24, 6 wkts in hand → win prob {model.predict_proba(scenario)[0, 1]:.1%}")


if __name__ == "__main__":
    main()
