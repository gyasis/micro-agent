# CLI Interface Contract: Simple Mode with Auto-Escalation

**Feature**: 002-simple-escalation
**Date**: 2026-02-16

---

## New CLI Flags

These flags extend the existing `ma-loop run <target>` command.

### `--simple [N]`

| Field | Value |
|---|---|
| Flag | `--simple [N]` |
| Default | `5` (if flag present but no N given) |
| Type | Optional integer, 1–50 |
| Description | Run in simple mode for N iterations before considering escalation |
| Mutually exclusive with | `--full` |

**Behaviour**:
- When `--simple N` is passed: run Artisan + Tests for up to N iterations. If no success, escalate to full mode (unless `--no-escalate`)
- When `--simple` passed without N: defaults to 5 iterations
- When neither `--simple` nor `--full` is passed: defaults to `--simple 5` (simple mode is the default)

---

### `--no-escalate`

| Field | Value |
|---|---|
| Flag | `--no-escalate` |
| Default | false (escalation is on by default) |
| Type | Boolean |
| Description | Disable auto-escalation. Simple mode exits with failure if iterations exhausted. |
| Works with | `--simple N` |

---

### `--full`

| Field | Value |
|---|---|
| Flag | `--full` |
| Default | false |
| Type | Boolean |
| Description | Skip simple mode entirely. Run full pipeline (Librarian → Artisan → Critic → Tests) from iteration 1. |
| Mutually exclusive with | `--simple` |

---

## Command Examples

```bash
# Default: simple mode, N=5, auto-escalate if needed
ma-loop run src/math.ts --test "npm test"

# Simple mode, custom N=3
ma-loop run src/math.ts --simple 3 --test "npm test"

# Simple mode only, no escalation
ma-loop run src/math.ts --simple 5 --no-escalate

# Full mode from the start (original v1 behaviour restored)
ma-loop run src/math.ts --full

# Simple mode with budget cap
ma-loop run src/math.ts --simple 5 --max-budget 0.10

# All existing flags still work alongside new ones
ma-loop run src/math.ts --simple 3 --max-iterations 20 --max-budget 0.50 --verbose
```

---

## Output Contract

### On Simple Mode Success

```
============================================================
✓ Simple Mode: Solved in 3/5 iterations
============================================================
Status:    SUCCESS ✓
Mode:      Simple (escalation not needed)
Iterations: 3 simple / 0 full
Cost:       $0.012 simple / $0.000 full / $0.012 total
Duration:   8.4s
```

### On Escalation + Full Mode Success

```
============================================================
⚡ Escalating to Full Mode after 5 simple iterations
   Summary: multiply() failed with "Expected 12, received NaN" across all attempts
============================================================

Phase 2: Full Mode starting (informed by simple mode history)...

============================================================
✓ Full Mode: Solved in 2 additional iterations
============================================================
Status:    SUCCESS ✓
Mode:      Simple → Full (escalated)
Iterations: 5 simple / 2 full / 7 total
Cost:       $0.025 simple / $0.041 full / $0.066 total
Duration:   34.2s
```

### On Full Failure (both modes failed)

```
============================================================
✗ Both modes exhausted without success
============================================================
Status:    FAILED ✗
Mode:      Simple → Full (escalated, also failed)
Iterations: 5 simple / 8 full / 13 total
Cost:       $0.025 simple / $0.110 full / $0.135 total
Duration:   89.1s

Simple mode errors:
  - "Expected 12, received NaN" (iterations 1-5)

Full mode errors:
  - "Cannot read properties of undefined" (iterations 1-3)
  - "Expected 12, received NaN" (iterations 4-8)
```

---

## Internal Function Contracts

### `runSimpleIteration(context, agents, testRunner)`

```typescript
async function runSimpleIteration(
  context: AgentContext,
  agents: { artisan: ArtisanAgent },
  testRunner: TestRunner
): Promise<{
  context: AgentContext;
  success: boolean;
  record: SimpleIterationRecord;
}>
```

Skips Librarian (phase 1) and Critic (phase 3). Only calls Artisan + Tests.

---

### `buildFailureSummary(records)`

```typescript
function buildFailureSummary(
  records: SimpleIterationRecord[]
): FailureSummary
```

Compresses all `SimpleIterationRecord[]` into a `FailureSummary` including the plain-text `naturalLanguageSummary` for Librarian injection.

---

### `withEscalationContext(context, summary)`

```typescript
function withEscalationContext(
  context: AgentContext,
  summary: FailureSummary
): AgentContext
```

Returns a new `AgentContext` with `escalationContext` set to `summary.naturalLanguageSummary`. Follows the existing immutable context update pattern.
