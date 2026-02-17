# Research: Multi-Tier Model Escalation

**Feature**: 003-tiered-escalation
**Date**: 2026-02-17
**Status**: Complete — no NEEDS CLARIFICATION items remain

---

## Decision 1: SQLite Library Choice

**Decision**: Use `better-sqlite3` with `@types/better-sqlite3`.

**Rationale**: `better-sqlite3` is the canonical SQLite library for Node.js/TypeScript CLIs:
- **Synchronous API** — ideal for a CLI tool where async SQLite overhead adds no value; sync writes keep the audit log simple and reliable
- **Native bindings** — compiled C extension gives the fastest possible write throughput (relevant for high-iteration runs)
- **TypeScript first** — `@types/better-sqlite3` provides full type coverage; works out of the box with the project's existing TypeScript 5.x setup
- **Battle-tested** — used by VS Code, Electron, and thousands of CLI tools; mature and actively maintained
- **Best-effort writes** are simple to implement with try/catch around sync calls — no dangling promise chains

**Alternatives considered**:
- `sql.js` — pure JS (no native bindings), but significantly slower and carries a large WASM bundle; unnecessary overhead for a local CLI
- `@databases/sqlite` — promise-based wrapper around `better-sqlite3`; async adds complexity for no benefit in this use case
- `knex` / `drizzle` ORM — far too heavy for a 3-table audit schema; we control the schema entirely

**Install**: `npm install better-sqlite3 && npm install -D @types/better-sqlite3`

---

## Decision 2: Tier Config JSON Schema

**Decision**: A single JSON file (e.g., `tiers.json`) defines the full escalation config. It is referenced by path from the existing YAML config via a `tierConfigFile` key.

**Schema**:
```json
{
  "tiers": [
    {
      "name": "local-free",
      "mode": "simple",
      "maxIterations": 5,
      "models": {
        "artisan": "ollama/codellama"
      }
    },
    {
      "name": "mid-grade",
      "mode": "simple",
      "maxIterations": 3,
      "models": {
        "artisan": "claude-haiku-4-5-20251001"
      }
    },
    {
      "name": "power",
      "mode": "full",
      "maxIterations": 5,
      "models": {
        "artisan": "claude-sonnet-4-5-20250929",
        "librarian": "claude-haiku-4-5-20251001",
        "critic": "claude-haiku-4-5-20251001"
      }
    }
  ],
  "global": {
    "auditDbPath": ".micro-agent/audit.db",
    "maxTotalCostUsd": 2.0,
    "maxTotalDurationMinutes": 30
  }
}
```

**Zod Schema** (TypeScript):
```typescript
import { z } from 'zod';

const TierModelsSchema = z.object({
  artisan:   z.string().min(1),
  librarian: z.string().min(1).optional(),
  critic:    z.string().min(1).optional(),
});

const TierConfigSchema = z.object({
  name:          z.string().min(1),
  mode:          z.enum(['simple', 'full']),
  maxIterations: z.number().int().min(1).max(100),
  models:        TierModelsSchema,
});

const TierGlobalSchema = z.object({
  auditDbPath:             z.string().optional().default('.micro-agent/audit.db'),
  maxTotalCostUsd:         z.number().positive().optional(),
  maxTotalDurationMinutes: z.number().positive().optional(),
});

export const TierEscalationConfigSchema = z.object({
  tiers:  z.array(TierConfigSchema).min(1),
  global: TierGlobalSchema.optional().default({}),
});

export type TierEscalationConfig = z.infer<typeof TierEscalationConfigSchema>;
export type TierConfig           = z.infer<typeof TierConfigSchema>;
```

**Validation rules**:
- At least 1 tier required
- `simple` mode tiers: only `artisan` model is required (librarian/critic ignored)
- `full` mode tiers: artisan required; librarian/critic default to artisan model if omitted
- `maxIterations` must be ≥ 1 and ≤ 100
- Model strings are validated against provider format at startup (not schema-level)

**Config file location**: referenced via existing YAML config (no new CLI flag needed — keeps the CLI surface minimal):
```yaml
# micro-agent.yml
tierConfigFile: ./tiers.json
```

Alternatively, `--tier-config <path>` CLI flag for one-off overrides.

---

## Decision 3: Accumulated Failure Context Pattern

**Decision**: Each tier produces a `naturalLanguageSummary` string. On escalation, the new tier receives a `AccumulatedFailureSummary` that concatenates all prior tier summaries with tier headers, capped at 4000 characters.

**Format** (injected into next tier's context as `escalationContext`):
```
=== TIER 1 FAILURES: local-free (5 iterations) ===
SIMPLE MODE HISTORY (5 iterations, all failed):

Iteration 1: Changed multiply() return from `a + b` to `a - b`. Test failed: "Expected 12, received -1"
...
Unique error patterns: Expected N, received M

=== TIER 2 FAILURES: mid-grade (3 iterations) ===
SIMPLE MODE HISTORY (3 iterations, all failed):

Iteration 1: Added null guard. Test still failed: "Expected 12, received NaN"
...
Unique error patterns: received NaN
```

**Token cap**: 4000 characters total (≈ 1000 tokens). If over limit, oldest tier history is truncated first with a `[truncated]` marker, preserving the most recent tier's history.

**Rationale**: Plain text works universally across all LLM providers. Each tier gets progressively more context. The 002-simple-escalation `naturalLanguageSummary` format is reused and extended.

**Alternatives considered**:
- Passing raw diffs: Too noisy; narrative summaries are more useful to LLMs
- JSON structure: Requires prompt engineering to parse; plain text is simpler and as effective
- Per-tier SQLite read at escalation time: Overkill; the in-memory accumulation is sufficient

---

## Decision 4: Per-Tier Mode and Existing Simple/Full Mode Interaction

**Decision**: The `--simple`, `--full`, and `--no-escalate` flags from `002-simple-escalation` remain active for the legacy two-mode path. When a `tierConfigFile` is detected, the tier engine takes over **entirely** and the legacy flags are ignored (with a warning if both are present).

**Priority**: `tierConfigFile` presence → tier engine mode. Absence → legacy simple/full mode.

**Rationale**: Clean separation prevents confusion between two different escalation systems. Each tier's `mode` field (`simple` or `full`) dictates which agents run for that tier — no CLI flag needed.

**Backward compatibility**: Users without a `tierConfigFile` see zero change. This satisfies FR-010 and SC-006 exactly.

---

## Decision 5: Global Budget Tracking Across Tiers

**Decision**: A single shared `globalBudget` object (cost USD, duration minutes) is initialized at run start and decremented by each tier. Per-tier `maxIterations` is a soft cap; global budget is the hard cap.

**Implementation**: Thread the `AgentContext.budget` through all tiers unchanged. Each tier's `runTier()` call reduces from the same budget pool. When `isBudgetExceeded()` returns true mid-tier, the tier exits immediately and no further tiers start.

**Run ID**: A UUID (v4) is generated once per `ma-loop run` invocation and written to every `TierAttemptRecord` row, grouping all tiers under one run.

---

## Decision 6: Database Write Strategy (Best-Effort)

**Decision**: Every `TierAttemptRecord` is written synchronously via `better-sqlite3` immediately after each iteration completes. DB errors are caught, a warning is logged to stderr, and the run continues. The final run outcome is never affected by DB failures.

**Implementation**:
```typescript
try {
  db.prepare(`INSERT INTO tier_attempts (...) VALUES (...)`).run(...values);
} catch (err) {
  logger.warn(`[audit] DB write failed: ${err.message} — continuing`);
}
```

**File locking**: `better-sqlite3` handles SQLite's built-in file locking automatically. If another process holds the lock, the write throws, is caught, and the warning is logged.

---

## Existing Code Reuse Map

| New Piece | Reuses |
|---|---|
| `TierEngine` | `runSimpleIteration()` + `runSingleIteration()` from `run.ts` |
| `buildAccumulatedSummary()` | `buildFailureSummary()` from `002-simple-escalation` |
| `withEscalationContext()` | Already implemented in `agent-context.ts` |
| Tier agent injection | `AgentContext.model` override per tier |
| Global budget tracking | Existing `isBudgetExceeded()` from `agent-context.ts` |
| Config loading | Existing YAML config loader pattern in `src/config/` |
| Schema validation | Existing Zod usage pattern throughout codebase |

---

## No NEEDS CLARIFICATION Items

All decisions resolved. Ready for Phase 1 design.
