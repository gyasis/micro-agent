# Data Model: Multi-Tier Model Escalation

**Feature**: 003-tiered-escalation
**Date**: 2026-02-17

---

## Entity Overview

```
TierEscalationConfig
  └── tiers: TierConfig[]         (ordered list of tier definitions)
  └── global: GlobalBudget        (shared budget and DB settings)

RunRecord
  └── runId: string               (UUID — groups all tiers for one invocation)
  └── attempts: TierAttemptRecord[] (one per iteration across all tiers)

AccumulatedFailureSummary         (in-memory, not persisted)
  └── Built from TierAttemptRecord[] before each escalation handoff
```

---

## Entity 1: TierConfig

One entry in the user's tier configuration file. Defines how a single tier operates.

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Non-empty; used as label in reports and DB records |
| `mode` | `'simple' \| 'full'` | Yes | `simple` = artisan + tests only; `full` = all three agents |
| `maxIterations` | `number` | Yes | Integer, 1–100; soft cap (global budget is hard cap) |
| `models.artisan` | `string` | Yes | Model identifier (e.g., `"ollama/codellama"`, `"claude-haiku-4-5-20251001"`) |
| `models.librarian` | `string` | No | Required only for `full` mode; defaults to `artisan` model if omitted |
| `models.critic` | `string` | No | Required only for `full` mode; defaults to `artisan` model if omitted |

**Validation rules**:
- `simple` mode tiers: `librarian` and `critic` are ignored even if provided
- `full` mode tiers: all three agents run; `librarian`/`critic` default to `artisan` if absent
- Model strings are validated against the provider registry at startup before any LLM calls

---

## Entity 2: TierEscalationConfig

The full configuration file (`tiers.json`). Contains the ordered tier list and global settings.

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `tiers` | `TierConfig[]` | Yes | At least 1 tier required; order is the execution order |
| `global.auditDbPath` | `string` | No | Default: `.micro-agent/audit.db` (relative to working directory) |
| `global.maxTotalCostUsd` | `number` | No | Hard cap in USD; overrides per-tier budget if set |
| `global.maxTotalDurationMinutes` | `number` | No | Hard cap in minutes; overrides per-tier duration if set |

**State transitions**:
```
Config file absent    → Legacy two-mode path (simple/full, FR-010)
Config file present   → Tier engine path (FR-001–FR-009, FR-011–FR-012)
Config invalid        → Validation error at startup, no LLM calls made (FR-012)
```

---

## Entity 3: TierAttemptRecord

One database row per iteration per tier. All fields written synchronously after each iteration. This is the primary audit trail.

| Field | Type | SQLite Column | Notes |
|-------|------|--------------|-------|
| `runId` | `string` | `run_id TEXT` | UUID v4 — groups all tiers for one `ma-loop run` invocation |
| `tierIndex` | `number` | `tier_index INTEGER` | 0-based index of this tier in the config array |
| `tierName` | `string` | `tier_name TEXT` | From `TierConfig.name` |
| `tierMode` | `string` | `tier_mode TEXT` | `'simple'` or `'full'` |
| `modelArtisan` | `string` | `model_artisan TEXT` | Model used for artisan agent in this tier |
| `modelLibrarian` | `string \| null` | `model_librarian TEXT` | Null for simple mode tiers |
| `modelCritic` | `string \| null` | `model_critic TEXT` | Null for simple mode tiers |
| `iteration` | `number` | `iteration INTEGER` | 1-based iteration number within this tier |
| `codeChangeSummary` | `string` | `code_change_summary TEXT` | Natural language description of what the artisan changed |
| `testStatus` | `string` | `test_status TEXT` | `'passed'`, `'failed'`, or `'error'` |
| `failedTests` | `string` | `failed_tests TEXT` | JSON array of failed test names |
| `errorMessages` | `string` | `error_messages TEXT` | JSON array of error message strings |
| `costUsd` | `number` | `cost_usd REAL` | LLM API cost for this iteration (0.0 for local models) |
| `durationMs` | `number` | `duration_ms INTEGER` | Wall-clock time for this iteration in milliseconds |
| `timestamp` | `string` | `timestamp TEXT` | ISO 8601 UTC timestamp when iteration completed |

---

## Entity 4: RunRecord

Logical grouping of all `TierAttemptRecord` rows for one `ma-loop run` invocation. Not a separate DB table — derived by querying `tier_attempts WHERE run_id = ?`.

| Field | Derived From |
|-------|-------------|
| `runId` | UUID generated at start of `runCommand()` |
| `startedAt` | Timestamp of first `TierAttemptRecord` |
| `completedAt` | Timestamp of last `TierAttemptRecord` |
| `totalTiers` | Count of distinct `tier_index` values |
| `totalIterations` | Count of all rows |
| `totalCostUsd` | Sum of all `cost_usd` values |
| `resolvedAt` | `tier_index` and `iteration` of first `testStatus = 'passed'` row |
| `objective` | Stored in `run_metadata` table (separate) |

---

## Entity 5: AccumulatedFailureSummary (in-memory)

Built from `TierAttemptRecord[]` before each tier escalation. Not persisted to the database — derived on demand from in-memory records and passed as `escalationContext` to the next tier's `AgentContext`.

| Field | Type | Description |
|-------|------|-------------|
| `naturalLanguageSummary` | `string` | Concatenated tier summaries with headers; max 4000 chars |
| `totalIterationsAcrossTiers` | `number` | Sum of all iterations from all prior tiers |
| `totalCostUsdAcrossTiers` | `number` | Sum of all costs from all prior tiers |
| `allUniqueErrorSignatures` | `string[]` | Deduplicated error messages across all prior tiers |
| `lastFailedTests` | `string[]` | Failed test names from the most recent iteration |

**Construction**:
```typescript
function buildAccumulatedSummary(
  priorTierRecords: Map<string, TierAttemptRecord[]>  // tierName → records
): AccumulatedFailureSummary

// Output format injected into next tier's AgentContext.escalationContext:
// === TIER 1 FAILURES: local-free (5 iterations) ===
// SIMPLE MODE HISTORY (5 iterations, all failed):
// Iteration 1: ...
// ...
// === TIER 2 FAILURES: mid-grade (3 iterations) ===
// SIMPLE MODE HISTORY (3 iterations, all failed):
// ...
// [total accumulated across 2 tiers: 8 iterations, $0.034]
```

---

## SQLite Database Schema

```sql
-- Table 1: Per-iteration audit records (primary table)
CREATE TABLE IF NOT EXISTS tier_attempts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id              TEXT    NOT NULL,
  tier_index          INTEGER NOT NULL,
  tier_name           TEXT    NOT NULL,
  tier_mode           TEXT    NOT NULL CHECK (tier_mode IN ('simple', 'full')),
  model_artisan       TEXT    NOT NULL,
  model_librarian     TEXT,
  model_critic        TEXT,
  iteration           INTEGER NOT NULL,
  code_change_summary TEXT    NOT NULL DEFAULT '',
  test_status         TEXT    NOT NULL CHECK (test_status IN ('passed', 'failed', 'error')),
  failed_tests        TEXT    NOT NULL DEFAULT '[]',  -- JSON array
  error_messages      TEXT    NOT NULL DEFAULT '[]',  -- JSON array
  cost_usd            REAL    NOT NULL DEFAULT 0.0,
  duration_ms         INTEGER NOT NULL DEFAULT 0,
  timestamp           TEXT    NOT NULL
);

-- Table 2: Run-level metadata
CREATE TABLE IF NOT EXISTS run_metadata (
  run_id              TEXT    PRIMARY KEY,
  objective           TEXT    NOT NULL,
  working_directory   TEXT    NOT NULL,
  test_command        TEXT    NOT NULL,
  tier_config_path    TEXT    NOT NULL,
  started_at          TEXT    NOT NULL,
  completed_at        TEXT,
  outcome             TEXT    CHECK (outcome IN ('success', 'failed', 'budget_exhausted', 'in_progress')),
  resolved_tier_name  TEXT,   -- NULL if all tiers failed
  resolved_iteration  INTEGER -- NULL if all tiers failed
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tier_attempts_run_id ON tier_attempts(run_id);
CREATE INDEX IF NOT EXISTS idx_tier_attempts_run_tier ON tier_attempts(run_id, tier_index);
```

---

## State Transition Diagram

```
runCommand() starts
      │
      ▼
tierConfig absent? ──Yes──► Legacy path (simple/full flags from 002)
      │No
      ▼
Validate tierConfig ──Fail──► Exit with validation errors (FR-012)
      │Pass
      ▼
Generate run_id, write run_metadata (in_progress)
      │
      ▼
┌─────────────────────────────────┐
│  for each tier in tiers:        │
│    ┌──────────────────────┐     │
│    │  runTier(tier, ctx)  │     │
│    │   for iter in 1..N:  │     │
│    │     run iteration    │     │
│    │     write DB record  │     │
│    │     if passed: break │     │
│    │     if budget: break │     │
│    └──────────────────────┘     │
│    if success: stop tiers       │
│    if budget exhausted: stop    │
│    else: buildAccumulatedSummary│
│          inject escalationContext│
│          continue to next tier  │
└─────────────────────────────────┘
      │
      ▼
Update run_metadata (success/failed/budget_exhausted)
Print final report (FR-011)
```

---

## File Layout (New Files)

```text
src/
├── lifecycle/
│   ├── tier-config.ts        # TierEscalationConfig loader + Zod schema + validation
│   ├── tier-engine.ts        # runTier() — executes one tier's iteration loop
│   ├── tier-accumulator.ts   # buildAccumulatedSummary() — composes escalation context
│   └── tier-db.ts            # SQLite audit log: open/close/write/schema migrations
```
