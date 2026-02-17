# Contract: SQLite Audit Database Schema

**Feature**: 003-tiered-escalation
**Date**: 2026-02-17
**Default path**: `.micro-agent/audit.db`

---

## Schema DDL

```sql
-- ─── Table 1: Per-iteration audit records ─────────────────────────────────────
-- One row per iteration per tier. Primary audit trail.
-- Append-only. Never deleted automatically.
CREATE TABLE IF NOT EXISTS tier_attempts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id              TEXT    NOT NULL,
  tier_index          INTEGER NOT NULL,
  tier_name           TEXT    NOT NULL,
  tier_mode           TEXT    NOT NULL CHECK (tier_mode IN ('simple', 'full')),
  model_artisan       TEXT    NOT NULL,
  model_librarian     TEXT,                      -- NULL for simple mode tiers
  model_critic        TEXT,                      -- NULL for simple mode tiers
  iteration           INTEGER NOT NULL,
  code_change_summary TEXT    NOT NULL DEFAULT '',
  test_status         TEXT    NOT NULL CHECK (test_status IN ('passed', 'failed', 'error')),
  failed_tests        TEXT    NOT NULL DEFAULT '[]',    -- JSON array of strings
  error_messages      TEXT    NOT NULL DEFAULT '[]',    -- JSON array of strings
  cost_usd            REAL    NOT NULL DEFAULT 0.0,
  duration_ms         INTEGER NOT NULL DEFAULT 0,
  timestamp           TEXT    NOT NULL              -- ISO 8601 UTC: 2026-02-17T14:23:01.456Z
);

-- ─── Table 2: Run-level metadata ──────────────────────────────────────────────
-- One row per ma-loop run invocation.
-- Created at start, updated at end with outcome.
CREATE TABLE IF NOT EXISTS run_metadata (
  run_id              TEXT    PRIMARY KEY,
  objective           TEXT    NOT NULL,
  working_directory   TEXT    NOT NULL,
  test_command        TEXT    NOT NULL,
  tier_config_path    TEXT    NOT NULL,           -- Absolute path to tiers.json used
  started_at          TEXT    NOT NULL,           -- ISO 8601 UTC
  completed_at        TEXT,                       -- NULL while in progress
  outcome             TEXT    CHECK (outcome IN ('success', 'failed', 'budget_exhausted', 'in_progress')),
  resolved_tier_name  TEXT,                       -- NULL if all tiers failed
  resolved_iteration  INTEGER                     -- NULL if all tiers failed
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tier_attempts_run_id
  ON tier_attempts(run_id);

CREATE INDEX IF NOT EXISTS idx_tier_attempts_run_tier
  ON tier_attempts(run_id, tier_index);

CREATE INDEX IF NOT EXISTS idx_tier_attempts_timestamp
  ON tier_attempts(timestamp);
```

---

## Example Records

### run_metadata row (successful run)

```
run_id:             "f4a2c781-9e03-4b2d-8c5a-1234abcd5678"
objective:          "Fix failing multiply() test"
working_directory:  "/home/user/my-project"
test_command:       "npm test"
tier_config_path:   "/home/user/my-project/tiers.json"
started_at:         "2026-02-17T14:20:00.000Z"
completed_at:       "2026-02-17T14:23:45.123Z"
outcome:            "success"
resolved_tier_name: "mid-grade"
resolved_iteration: 2
```

### tier_attempts rows (one run, 3 tiers attempted)

```
id=1  run_id=f4a2c781  tier_index=0  tier_name="local-free"  mode=simple
      iteration=1  status=failed  cost=0.00
      failed_tests=["multiply works"]  error_messages=["Expected 12, received -1"]

id=2  run_id=f4a2c781  tier_index=0  tier_name="local-free"  mode=simple
      iteration=2  status=failed  cost=0.00
      failed_tests=["multiply works"]  error_messages=["Expected 12, received NaN"]
... (5 rows total for local-free)

id=6  run_id=f4a2c781  tier_index=1  tier_name="mid-grade"  mode=simple
      iteration=1  status=failed  cost=0.00045
      failed_tests=["multiply works"]  error_messages=["Expected 12, received 0"]

id=7  run_id=f4a2c781  tier_index=1  tier_name="mid-grade"  mode=simple
      iteration=2  status=passed  cost=0.00038
      failed_tests=[]  error_messages=[]
```

---

## Common Queries

### Get full history for a specific run
```sql
SELECT
  tier_name, tier_mode, model_artisan, iteration,
  test_status, failed_tests, error_messages,
  cost_usd, duration_ms, timestamp
FROM tier_attempts
WHERE run_id = 'f4a2c781-9e03-4b2d-8c5a-1234abcd5678'
ORDER BY tier_index ASC, iteration ASC;
```

### Per-tier cost and iteration summary for a run
```sql
SELECT
  tier_name,
  COUNT(*) AS total_iterations,
  SUM(cost_usd) AS total_cost_usd,
  SUM(CASE WHEN test_status = 'passed' THEN 1 ELSE 0 END) AS successes
FROM tier_attempts
WHERE run_id = 'f4a2c781-9e03-4b2d-8c5a-1234abcd5678'
GROUP BY tier_index, tier_name
ORDER BY tier_index;
```

### All runs in the last 7 days
```sql
SELECT
  r.run_id, r.objective, r.outcome,
  r.resolved_tier_name, r.resolved_iteration,
  r.started_at, r.completed_at
FROM run_metadata r
WHERE r.started_at >= datetime('now', '-7 days')
ORDER BY r.started_at DESC;
```

### Cost breakdown across all runs
```sql
SELECT
  tier_name,
  COUNT(*) AS total_iterations,
  ROUND(SUM(cost_usd), 4) AS total_cost_usd
FROM tier_attempts
GROUP BY tier_name
ORDER BY total_cost_usd DESC;
```

### Most recent failure messages for a tier
```sql
SELECT error_messages
FROM tier_attempts
WHERE run_id = 'f4a2c781-9e03-4b2d-8c5a-1234abcd5678'
  AND tier_name = 'local-free'
  AND test_status != 'passed'
ORDER BY iteration DESC
LIMIT 5;
```

---

## Write Behaviour

- **Schema creation**: `CREATE TABLE IF NOT EXISTS` on every startup — idempotent, safe to run against existing DB
- **Run start**: `INSERT INTO run_metadata` with `outcome = 'in_progress'` at start of `runCommand()`
- **Per-iteration**: `INSERT INTO tier_attempts` immediately after each iteration completes
- **Run end**: `UPDATE run_metadata SET outcome=?, completed_at=?, resolved_tier_name=?, resolved_iteration=? WHERE run_id=?`
- **All writes are best-effort**: Wrapped in `try/catch`; failures logged as warnings; run continues

---

## Migration Notes

- Schema uses `CREATE TABLE IF NOT EXISTS` — no migration framework needed for v1
- Future schema changes: Add `schema_version` table if breaking changes needed
- Retention: Append-only. Users query and manage history manually (no automatic pruning)
