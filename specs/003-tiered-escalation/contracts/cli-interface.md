# Contract: CLI Interface — Multi-Tier Escalation

**Feature**: 003-tiered-escalation
**Date**: 2026-02-17

---

## New CLI Flag

```
--tier-config <path>     Path to JSON tier configuration file.
                         Enables tiered escalation mode.
                         Overrides tierConfigFile from YAML config.
                         When absent, existing simple/full mode is used (FR-010).
```

**Usage**:
```bash
# Via YAML config (recommended for team use)
ma-loop run src/multiply.ts                # uses tierConfigFile from micro-agent.yml

# Via CLI flag (one-off override)
ma-loop run src/multiply.ts --tier-config ./tiers.json

# Legacy flags still work when no tier config is present
ma-loop run src/multiply.ts --simple 3
ma-loop run src/multiply.ts --full
ma-loop run src/multiply.ts --no-escalate
```

---

## Function Signatures (TypeScript)

### `src/lifecycle/tier-config.ts`

```typescript
/** Load and validate a tier config file. Throws on validation failure. */
export function loadTierConfig(filePath: string): TierEscalationConfig;

/** Validate the full tier config (all tiers, all models). Returns error list. */
export function validateTierConfig(config: TierEscalationConfig): string[];
```

### `src/lifecycle/tier-engine.ts`

```typescript
/** Run a single tier's iteration loop. Returns TierRunResult. */
export async function runTier(
  tier: TierConfig,
  tierIndex: number,
  context: AgentContext,
  agents: AgentSet,
  testRunner: TestRunner,
  db: AuditDatabase,
  runId: string,
): Promise<TierRunResult>;

/** TierRunResult — outcome of one tier's run */
export interface TierRunResult {
  tierName:       string;
  tierIndex:      number;
  success:        boolean;
  iterationsRan:  number;
  totalCostUsd:   number;
  records:        TierAttemptRecord[];
  exitReason:     'success' | 'iterations_exhausted' | 'budget_exhausted' | 'provider_error';
}
```

### `src/lifecycle/tier-accumulator.ts`

```typescript
/** Build accumulated failure summary from all prior tier results. */
export function buildAccumulatedSummary(
  priorResults: TierRunResult[],
): AccumulatedFailureSummary;

/** Inject accumulated summary into AgentContext for the next tier. */
export function withTierEscalationContext(
  context: AgentContext,
  summary: AccumulatedFailureSummary,
): AgentContext;
```

### `src/lifecycle/tier-db.ts`

```typescript
/** Open (or create) the SQLite audit database. */
export function openAuditDatabase(dbPath: string): AuditDatabase;

/** Write one iteration record. Best-effort — never throws. */
export function writeAttemptRecord(
  db: AuditDatabase,
  record: TierAttemptRecord,
): void;

/** Create or update run metadata. Best-effort — never throws. */
export function writeRunMetadata(
  db: AuditDatabase,
  metadata: RunMetadataRow,
): void;

/** Close the database connection. */
export function closeAuditDatabase(db: AuditDatabase): void;
```

---

## Console Output Formats

### Startup (when tier config is present)
```
◆ Tiered escalation mode enabled (3 tiers configured)
  Tier 1: local-free   [simple]  ollama/codellama       max 5 iterations
  Tier 2: mid-grade    [simple]  claude-haiku-4-5-...   max 3 iterations
  Tier 3: power        [full]    claude-sonnet-4-5-...  max 5 iterations
◆ Audit log: .micro-agent/audit.db
```

### Per-Tier Header
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▶ Tier 1/3: local-free  [simple, ollama/codellama]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Per-Iteration Output (same as simple mode output)
```
  Iteration 1/5 [local-free]
  Artisan: Changing multiply() to use a * b instead of a + b
  Change:  src/math.ts line 4: return a * b
  Tests: ✗ 1 failed / 3 total
    ✗ multiply handles undefined
      Expected 12, received NaN
  Cost:  0.0000 this iteration
```

### Tier Escalation Event
```
✖ Tier 1 (local-free) exhausted 5 iterations without success.
◆ Escalating to Tier 2: mid-grade  [simple, claude-haiku-4-5-...]
  Carrying forward: 5 iterations of failure history
```

### Final Report — Success at Tier 2
```
✔ Fixed by Tier 2 (mid-grade) in iteration 2

━━━ Run Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mode:       Tiered escalation (3 tiers configured)
  Resolved:   Tier 2 — mid-grade (iteration 2)

  Tier 1 local-free    [simple]  5 iterations  $0.00    ✖ failed
  Tier 2 mid-grade     [simple]  2 iterations  $0.0008  ✔ solved
  Tier 3 power         [full]    — (not reached)

  Total:   7 iterations  |  $0.0008  |  2m 14s
  Audit:   .micro-agent/audit.db  (run: f4a2c781)
```

### Final Report — All Tiers Failed
```
✖ All 3 tiers exhausted without success.

━━━ Run Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mode:       Tiered escalation (3 tiers configured)
  Resolved:   — (none)

  Tier 1 local-free    [simple]  5 iterations  $0.00    ✖ failed
  Tier 2 mid-grade     [simple]  3 iterations  $0.0011  ✖ failed
  Tier 3 power         [full]    5 iterations  $0.047   ✖ failed

  Total:   13 iterations  |  $0.0481  |  8m 42s
  Audit:   .micro-agent/audit.db  (run: f4a2c781)

  Most recent errors:
    - "Expected 12, received NaN"
    - "Cannot read properties of undefined (reading 'value')"

  Full history: sqlite3 .micro-agent/audit.db
    > SELECT * FROM tier_attempts WHERE run_id='f4a2c781' ORDER BY tier_index, iteration;
```

### Final Report — Budget Exhausted Mid-Run
```
✖ Global budget exhausted during Tier 2 (mid-grade), iteration 2.

━━━ Run Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mode:       Tiered escalation (budget limit reached)
  Resolved:   — (budget exhausted)

  Tier 1 local-free    [simple]  5 iterations  $0.00    ✖ failed
  Tier 2 mid-grade     [simple]  2 iterations  $2.00    ✖ budget limit

  Total:   7 iterations  |  $2.00  |  budget cap hit
  Audit:   .micro-agent/audit.db  (run: f4a2c781)
```

---

## Validation Error Output

```
✖ Tier config validation failed: ./tiers.json

  Error 1: tiers[0].mode must be 'simple' or 'full' (got: 'fast')
  Error 2: tiers[1].models.artisan is required
  Error 3: tiers[2].models.artisan 'unknown-model-xyz' not found in provider registry

  Fix the errors above and re-run. No LLM calls were made.
```

---

## Backward Compatibility

When `--tier-config` is absent and no `tierConfigFile` in YAML:
- All existing `--simple`, `--full`, `--no-escalate` flags work exactly as before
- Zero change in output format or behaviour
- No SQLite DB created or referenced
