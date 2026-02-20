# Lifecycle API Reference

This document covers the core lifecycle classes and functions that implement the
Ralph Loop's iteration management, context tracking, session cleanup, and
N-tier escalation.

Source modules covered:

| Module | File |
|--------|------|
| `IterationManager` | `src/lifecycle/iteration-manager.ts` |
| `ContextMonitor` | `src/lifecycle/context-monitor.ts` |
| `SessionResetter` | `src/lifecycle/session-resetter.ts` |
| `TierEngine` / `runTier()` | `src/lifecycle/tier-engine.ts` |
| `TierConfig` / `TierEscalationConfig` | `src/lifecycle/tier-config.ts`, `src/lifecycle/types.ts` |
| `buildAccumulatedSummary()` | `src/lifecycle/tier-accumulator.ts` |
| `withTierEscalationContext()` | `src/lifecycle/tier-accumulator.ts` |

---

## IterationManager

### Description

`IterationManager` is the central budget and entropy tracker for a single Ralph
Loop run. It extends `EventEmitter` and emits events as the loop progresses.
It enforces three hard stop conditions — maximum iterations, maximum cost, and
maximum duration — and includes a circuit-breaker (entropy detector) that halts
the loop when the same error repeats more than `entropyThreshold` times in a row.

The class does not execute agents itself; it is called by the run command at the
beginning and end of each iteration to decide whether to continue.

### Constructor

```typescript
new IterationManager(config: IterationManagerConfig)
```

#### `IterationManagerConfig` parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionId` | `string` | — | Unique identifier for the current Ralph Loop session. Used in log output and event payloads. |
| `maxIterations` | `number` | `30` | Maximum number of iterations before the loop stops with reason `max_iterations`. |
| `maxCostUsd` | `number` | `2.0` | Maximum total LLM API cost in US dollars. |
| `maxDurationMinutes` | `number` | `15` | Maximum wall-clock minutes before the loop stops. |
| `contextResetFrequency` | `number` | `1` | Reset context every N iterations. Values above `1` emit a startup warning because they violate the gold standard. |
| `entropyThreshold` | `number` | `3` | Number of consecutive identical errors that triggers the entropy circuit breaker. |

### Factory function

```typescript
import { createIterationManager } from './src/lifecycle/iteration-manager';

const manager = createIterationManager('session-abc', {
  maxIterations: 20,
  maxCostUsd: 1.5,
});
```

`createIterationManager(sessionId, overrides?)` merges the provided overrides
with the defaults listed above.

### Public methods

#### `checkBudget(): BudgetStatus`

Evaluates all three budget constraints and returns their current state.

**Returns** `BudgetStatus`:

| Field | Type | Description |
|-------|------|-------------|
| `currentIteration` | `number` | Number of iterations completed so far. |
| `totalCost` | `number` | Accumulated LLM cost in USD. |
| `elapsedMinutes` | `number` | Wall-clock time since the manager was created. |
| `withinBudget` | `boolean` | `true` when all constraints are satisfied. |
| `reason` | `string \| undefined` | Human-readable explanation when `withinBudget` is `false`. |

**Example:**

```typescript
const status = manager.checkBudget();
if (!status.withinBudget) {
  console.error(`Stopping: ${status.reason}`);
}
```

---

#### `trackError(errorSignature: string): boolean`

Normalizes the error string (strips line numbers and numeric values) and
increments the entropy counter. Returns `true` when the circuit breaker fires
(i.e. the same normalized error has been seen `entropyThreshold` times
consecutively). Emits `'entropy-detected'` on trigger.

When a *different* error is encountered, the counter resets to 1 for the new
error.

| Parameter | Type | Description |
|-----------|------|-------------|
| `errorSignature` | `string` | Raw error string from the test runner output. |

**Returns** `boolean` — `true` if the entropy circuit breaker should halt the loop.

---

#### `recordCost(cost: number): void`

Adds `cost` (in USD) to the running total and emits `'cost-update'` with the
updated totals and remaining budget.

---

#### `incrementIteration(): number`

Increments the iteration counter by 1 and emits `'iteration-start'`. Returns
the new iteration number (1-based).

---

#### `shouldResetContext(): boolean`

Returns `true` when `currentIteration % contextResetFrequency === 0`. At the
gold-standard value of `contextResetFrequency = 1` this always returns `true`,
meaning context is reset after every iteration.

---

#### `getStats(): object`

Returns a snapshot of current run statistics:

| Field | Type | Description |
|-------|------|-------------|
| `iteration` | `number` | Current iteration count. |
| `totalCost` | `number` | Accumulated cost in USD. |
| `elapsedMinutes` | `number` | Elapsed wall-clock time. |
| `averageCostPerIteration` | `number` | `totalCost / iteration` (0 when no iterations run yet). |

---

#### `resetEntropy(): void`

Clears the entropy counter and last-error signature. Call this when the code
makes genuine progress (test output changes) to prevent false-positive circuit
breaker triggers.

### Events

| Event | Payload | Fired when |
|-------|---------|------------|
| `'iteration-start'` | `{ iteration, maxIterations }` | After `incrementIteration()` |
| `'cost-update'` | `{ iterationCost, totalCost, remaining }` | After `recordCost()` |
| `'entropy-detected'` | `{ errorSignature, count, threshold }` | Circuit breaker triggers in `trackError()` |

---

## ContextMonitor

### Description

`ContextMonitor` tracks cumulative token usage per agent per iteration and
enforces the **smart zone boundary** at 40% context usage. The Ralph Loop
principle is that LLM quality degrades measurably above 40% context fill (the
"dumb zone"). `ContextMonitor` provides a safety net that triggers an automatic
context reset even when `contextResetFrequency` is set above `1`.

It extends `EventEmitter` and emits threshold events as usage increases.

### Constructor

```typescript
new ContextMonitor(contextLimits?: ModelContextLimits)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `contextLimits` | `ModelContextLimits` | `DEFAULT_CONTEXT_LIMITS` | Map of model name to context window size in tokens. |

`DEFAULT_CONTEXT_LIMITS` contains built-in limits for all supported models (see
source for the full map). Unknown models default to a conservative 8 000 tokens
with a warning.

### Factory function

```typescript
import { createContextMonitor } from './src/lifecycle/context-monitor';

const monitor = createContextMonitor({ 'my-custom-model': 32_000 });
```

Custom limits are merged on top of the built-in defaults.

### Smart zone thresholds

| Constant | Value | Meaning |
|----------|-------|---------|
| `THRESHOLDS.SAFE` | `0.30` | 30% — safe zone, no action |
| `THRESHOLDS.WARNING` | `0.40` | 40% — smart zone boundary, automatic reset required |
| `THRESHOLDS.CRITICAL` | `0.50` | 50% — dumb zone, should never be reached with monitoring active |

### Public methods

#### `registerAgent(agent: string, model: string): void`

Associates an agent name with its model so that token counts can be expressed
as a percentage of the correct context window. Every agent must be registered
before `trackTokens()` is called for it. Unrecognized models fall back to
8 000 tokens with a `console.warn`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent` | `string` | Agent name, e.g. `'librarian'`, `'artisan'`, `'critic'`. |
| `model` | `string` | Model ID string matching a key in `ModelContextLimits`. |

**Example (required setup in `src/cli/commands/run.ts`):**

```typescript
contextMonitor.registerAgent('librarian', 'gemini-2.5-flash');
contextMonitor.registerAgent('artisan',   'claude-sonnet-4-20250514');
contextMonitor.registerAgent('critic',    'gpt-4o-mini');
```

---

#### `trackTokens(agent: string, tokens: number): ContextWarning | null`

Adds `tokens` to the agent's cumulative count, then checks against all three
thresholds. Returns a `ContextWarning` object when a threshold is crossed, or
`null` when the agent remains in the safe zone.

Emits `'usage-update'` on every call, and `'threshold-info'`,
`'threshold-warning'`, or `'threshold-critical'` when the relevant threshold
is crossed.

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent` | `string` | Registered agent name. Throws if not registered. |
| `tokens` | `number` | Number of tokens consumed in this call. |

**Returns** `ContextWarning | null`:

| Field | Type | Description |
|-------|------|-------------|
| `agent` | `string` | Agent name. |
| `model` | `string` | Model ID. |
| `usage` | `number` | Total tokens accumulated so far. |
| `limit` | `number` | Model context window size. |
| `percentage` | `number` | `usage / limit` (0–1). |
| `level` | `'info' \| 'warning' \| 'critical'` | Threshold level crossed. |
| `message` | `string` | Human-readable description of the threshold event. |

---

#### `shouldResetContext(): boolean`

Returns `true` when any registered agent has reached or exceeded the 40%
`THRESHOLDS.WARNING` boundary. Called by the run command at the end of each
iteration as a secondary check independent of `IterationManager.shouldResetContext()`.

---

#### `reset(): void`

Clears all accumulated token counts. Call this after completing a context reset
so the next iteration starts from zero. Emits `'reset'` with a timestamp.

---

#### `getUsage(agent: string): ContextUsage | null`

Returns the current usage snapshot for a single agent, or `null` if the agent
is not registered.

**Returns** `ContextUsage`:

| Field | Type | Description |
|-------|------|-------------|
| `agent` | `string` | Agent name. |
| `model` | `string` | Model ID. |
| `tokens` | `number` | Accumulated tokens. |
| `percentage` | `number` | Fraction of context window used (0–1). |
| `timestamp` | `number` | Unix ms timestamp of the snapshot. |

---

#### `getAllUsage(): ContextUsage[]`

Returns usage snapshots for all registered agents.

---

#### `getSummary(): object`

Returns aggregate statistics:

| Field | Type | Description |
|-------|------|-------------|
| `agents` | `number` | Number of registered agents. |
| `totalTokens` | `number` | Sum of tokens across all agents. |
| `maxUsagePercentage` | `number` | Highest individual agent usage fraction. |
| `maxUsageAgent` | `string \| null` | Agent name with highest usage. |
| `resetRequired` | `boolean` | `true` when `maxUsagePercentage >= 0.40`. |

### Events

| Event | Payload | Fired when |
|-------|---------|------------|
| `'usage-update'` | `ContextUsage` | Every `trackTokens()` call |
| `'threshold-info'` | `ContextWarning` | Usage crosses 30% |
| `'threshold-warning'` | `ContextWarning` | Usage crosses 40% (reset required) |
| `'threshold-critical'` | `ContextWarning` | Usage crosses 50% (dumb zone) |
| `'reset'` | `{ timestamp }` | After `reset()` |

---

## SessionResetter

### Description

`SessionResetter` destroys all LLM session state between iterations to enforce
the Ralph Loop gold standard of fresh context per iteration. It coordinates
cleanup of LLM API connections and individual agent state, then optionally runs
the Node.js garbage collector.

### Constructor

```typescript
new SessionResetter(options: ResetOptions)
```

#### `ResetOptions` parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionId` | `string` | — | Session identifier used in log output. |
| `verbose` | `boolean` | `false` | When `true`, logs each cleanup step to stdout with a `[SessionResetter:<sessionId>]` prefix. |

**Correct usage:**

```typescript
// CORRECT:
new SessionResetter({ sessionId: 'session-abc', verbose: true });

// WRONG — runtime crash (v4 pattern, not supported):
new SessionResetter('session-abc');
```

### Factory function

```typescript
import { createSessionResetter } from './src/lifecycle/session-resetter';

const resetter = createSessionResetter({ sessionId: 'session-abc', verbose: true });
```

### Public methods

#### `registerAgentCleanup(agent: string, cleanup: AgentCleanup): void`

Registers an async cleanup function for a named agent. The function is called
during `reset()`. Must be re-registered at the start of each iteration because
registrations are cleared after each reset.

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent` | `string` | Agent identifier used in log output. |
| `cleanup` | `() => Promise<void>` | Async function that resets the agent's state. |

---

#### `registerLLMCleanup(cleanup: LLMConnectionCleanup): void`

Registers an async function that closes an LLM API client connection. Multiple
cleanups can be registered and are all called during `reset()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `cleanup` | `() => Promise<void>` | Async function that closes the connection. |

Use the helper `createLLMCleanup(client)` to create a standard cleanup for any
client that exposes `.close()` or `.destroy()`.

---

#### `reset(iteration: number): Promise<ResetStats>`

Performs a complete context reset:

1. Calls every registered `LLMConnectionCleanup` function.
2. Calls every registered `AgentCleanup` function.
3. Clears all cleanup registrations (they must be re-registered next iteration).
4. Calls `global.gc()` if the Node.js process was started with `--expose-gc`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `iteration` | `number` | Current iteration number (1-based). Recorded in `ResetStats` and log output. |

**Returns** `Promise<ResetStats>`:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `number` | Unix ms timestamp when the reset completed. |
| `iteration` | `number` | Iteration number passed to `reset()`. |
| `llmConnectionsClosed` | `number` | Number of LLM connections successfully closed. |
| `agentsReset` | `number` | Number of agents successfully reset. |
| `memoryFreed` | `number` | Approximate bytes freed (heap difference before/after GC). |
| `duration` | `number` | Wall-clock milliseconds the reset took. |

Emits `'reset-complete'` with the `ResetStats` object. Emits `'cleanup-error'`
for any individual cleanup that throws, but continues resetting the remaining
registrations.

**Example:**

```typescript
const stats = await resetter.reset(currentIteration);
console.log(`Reset freed ${stats.memoryFreed} bytes in ${stats.duration}ms`);
```

---

#### `verifyReset(): { verified: boolean; issues: string[] }`

Checks that all cleanup registrations were cleared. Returns `verified: false`
with a list of issues if any registrations remain. Use this in tests or
diagnostic code to confirm the reset was complete.

---

#### `emergencyReset(): Promise<void>`

Clears all registrations immediately without calling cleanup functions.
Use only when the normal `reset()` path cannot be reached (e.g. unhandled
exception in the run loop). Emits `'emergency-reset'`.

---

#### `getStats(): { agentCleanupsRegistered: number; llmCleanupsRegistered: number }`

Returns the number of cleanup functions currently registered. Useful in
diagnostics and tests.

### Events

| Event | Payload | Fired when |
|-------|---------|------------|
| `'reset-complete'` | `ResetStats` | After successful `reset()` |
| `'cleanup-error'` | `{ type, agent?, error }` | A cleanup function throws |
| `'emergency-reset'` | _(none)_ | After `emergencyReset()` |

---

## TierEngine — `runTier()`

### Description

`runTier()` executes a single tier's iteration loop inside the N-tier escalation
system. It runs the provided iteration function up to `tierConfig.maxIterations`
times, records every attempt to the SQLite audit database (when available),
checks the budget before each iteration, and returns as soon as the code passes
tests or a stop condition is reached.

Tiers run sequentially: when a tier succeeds, the outer escalation loop stops.
When a tier exhausts its iterations without success, the next tier is tried with
the accumulated failure context injected into its Librarian prompt.

### Signature

```typescript
export async function runTier(
  tierCtx: TierEngineContext,
  runSimpleIteration: (ctx, agents, testRunner) => Promise<{ context, success }>,
  runFullIteration?: (ctx, agents, testRunner) => Promise<{ context, success }>,
): Promise<{ result: TierRunResult; finalContext: AgentContext }>
```

#### `TierEngineContext` parameters

| Field | Type | Description |
|-------|------|-------------|
| `runId` | `string` | UUID for the current escalation run. Written to every `TierAttemptRecord`. |
| `tierConfig` | `TierConfig` | Configuration for this specific tier (name, mode, models, maxIterations). |
| `tierIndex` | `number` | Zero-based index of this tier within the `tiers` array. |
| `totalTiers` | `number` | Total number of tiers in the escalation config. |
| `context` | `AgentContext` | The agent context passed into this tier (may contain accumulated failure summary from prior tiers). |
| `agents` | `any` | Agent instances (Librarian, Artisan, Critic) used by the iteration runner. |
| `testRunner` | `any` | `TestRunner` instance. |
| `db` | `AuditDatabase \| null` | SQLite database handle. `null` if audit logging is disabled. |

#### `runSimpleIteration` / `runFullIteration`

Both have the same signature:

```typescript
(ctx: AgentContext, agents: any, testRunner: any) => Promise<{ context: AgentContext; success: boolean }>
```

`runTier` selects `runFullIteration` when `tierConfig.mode === 'full'` and
`runFullIteration` is provided; otherwise it uses `runSimpleIteration`.

### Return type

`Promise<{ result: TierRunResult; finalContext: AgentContext }>`

#### `TierRunResult` fields

| Field | Type | Description |
|-------|------|-------------|
| `tierName` | `string` | Name from `TierConfig`. |
| `tierIndex` | `number` | Zero-based tier position. |
| `success` | `boolean` | `true` when any iteration passed all tests. |
| `iterationsRan` | `number` | Number of iterations actually executed. |
| `totalCostUsd` | `number` | Cumulative LLM cost for this tier. |
| `records` | `TierAttemptRecord[]` | One record per iteration attempt. |
| `exitReason` | `'success' \| 'iterations_exhausted' \| 'budget_exhausted' \| 'provider_error'` | Why the tier loop stopped. |

### Usage example

```typescript
import { runTier } from './src/lifecycle/tier-engine';

const { result, finalContext } = await runTier(
  {
    runId: 'run-001',
    tierConfig: { name: 'Haiku', mode: 'simple', maxIterations: 5,
                  models: { artisan: 'claude-haiku-4' } },
    tierIndex: 0,
    totalTiers: 3,
    context: initialAgentContext,
    agents,
    testRunner,
    db: null,
  },
  runSimpleIteration,
  runFullIteration,
);

if (!result.success) {
  console.log(`Tier exhausted after ${result.iterationsRan} iterations: ${result.exitReason}`);
}
```

---

## TierConfig and TierEscalationConfig

### Description

These types define the shape of the N-tier escalation JSON file (referenced by
`tierConfigFile` in `ralph.config.yaml`). They are validated at load time by
`loadTierConfig()` using Zod schemas in `src/lifecycle/tier-config.ts`.

### `TierConfig` fields

| Field | Type | Valid Values | Description |
|-------|------|--------------|-------------|
| `name` | `string` | Non-empty string | Human-readable tier label shown in log output. |
| `mode` | `string` (enum) | `'simple'`, `'full'` | `'simple'` uses only the Artisan; `'full'` uses all three agents (Librarian, Artisan, Critic). |
| `maxIterations` | `number` | Integer 1–100 | Maximum attempts for this tier before escalating. |
| `models.artisan` | `string` | Non-empty string | Model ID for the Artisan agent in this tier. Required. |
| `models.librarian` | `string` | Non-empty string | Model ID for the Librarian. Optional (only used in `'full'` mode). |
| `models.critic` | `string` | Non-empty string | Model ID for the Critic. Optional (only used in `'full'` mode). |

### `TierEscalationConfig` fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tiers` | `TierConfig[]` | — | Ordered array of tiers. At least one tier is required. Tiers are attempted in array order. |
| `global.auditDbPath` | `string` | — | Path for the SQLite audit database. Omit to disable audit logging. |
| `global.maxTotalCostUsd` | `number` | — | Hard cap on total cost across all tiers combined. |
| `global.maxTotalDurationMinutes` | `number` | — | Hard cap on total wall-clock time across all tiers. |

### `loadTierConfig(filePath: string): Promise<TierEscalationConfig>`

Reads, JSON-parses, and validates the tier config file. Throws descriptive
errors with fix hints when the file is missing, the JSON is malformed, or the
schema is invalid.

```typescript
import { loadTierConfig } from './src/lifecycle/tier-config';

const tierConfig = await loadTierConfig('./.micro-agent/tiers.json');
```

### `validateTierConfig(config: unknown): string[]`

Non-throwing alternative that returns an array of error strings (empty when
valid). Use for programmatic validation without loading from disk.

### Example tier config file

```json
{
  "tiers": [
    {
      "name": "Haiku-Simple",
      "mode": "simple",
      "maxIterations": 5,
      "models": {
        "artisan": "claude-haiku-4"
      }
    },
    {
      "name": "Sonnet-Simple",
      "mode": "simple",
      "maxIterations": 10,
      "models": {
        "artisan": "claude-sonnet-4-20250514"
      }
    },
    {
      "name": "Opus-Full",
      "mode": "full",
      "maxIterations": 15,
      "models": {
        "artisan": "claude-opus-4-6",
        "librarian": "gemini-2.5-flash",
        "critic": "gpt-4o-mini"
      }
    }
  ],
  "global": {
    "auditDbPath": "./.micro-agent/audit.db",
    "maxTotalCostUsd": 5.0,
    "maxTotalDurationMinutes": 45
  }
}
```

---

## `buildAccumulatedSummary()`

**Module:** `src/lifecycle/tier-accumulator.ts`

### Description

Compresses the failure history from all prior tiers into an
`AccumulatedFailureSummary` for injection into the next tier's Librarian prompt.
The summary describes what each tier tried and what errors remained, giving the
next (more capable) tier full context without carrying raw conversation history.

The output `naturalLanguageSummary` is capped at **4 000 characters**. When the
full text of all tier blocks exceeds this cap, the function iteratively drops
the oldest tier blocks from the front until the remaining blocks fit. If even
the last single block exceeds 4 000 characters, it is hard-truncated at
`4000 - len(TRUNCATION_MARKER)` characters and the truncation marker
`'\n[prior tier history truncated for context efficiency]'` is appended.

### Signature

```typescript
export function buildAccumulatedSummary(
  priorResults: TierRunResult[],
): AccumulatedFailureSummary
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `priorResults` | `TierRunResult[]` | Results from all tiers that have already run. Pass an empty array for the first tier (returns an empty summary). |

### Return type — `AccumulatedFailureSummary`

| Field | Type | Description |
|-------|------|-------------|
| `naturalLanguageSummary` | `string` | Human-readable block (max 4 000 chars) describing what each prior tier tried and which errors persisted. Empty string when `priorResults` is empty. |
| `totalIterationsAcrossTiers` | `number` | Sum of `iterationsRan` across all prior tiers. |
| `totalCostUsdAcrossTiers` | `number` | Sum of `totalCostUsd` across all prior tiers. |
| `allUniqueErrorSignatures` | `string[]` | Deduplicated list of all error messages seen across all prior tiers. |
| `lastFailedTests` | `string[]` | Failed test names from the last record of the most recent prior tier. |

### 4 000-character cap behavior

```
Full summary: [tier-1-block][tier-2-block][tier-3-block][footer]

If total > 4000 chars:
  Try: [tier-2-block][tier-3-block][footer]        <- drop oldest
  Try: [tier-3-block][footer]                       <- drop one more
  If still > 4000: hard-truncate last block + TRUNCATION_MARKER
```

### Usage example

```typescript
import { buildAccumulatedSummary } from './src/lifecycle/tier-accumulator';

const summary = buildAccumulatedSummary(completedTierResults);
console.log(`Accumulated ${summary.totalIterationsAcrossTiers} iterations`);
console.log(summary.naturalLanguageSummary);
```

---

## `withTierEscalationContext()`

**Module:** `src/lifecycle/tier-accumulator.ts`

### Description

Injects an `AccumulatedFailureSummary` into an `AgentContext` so that the next
tier's Librarian receives the failure history as part of its prompt context.
When the summary is empty (first tier, or empty `priorResults`), the context is
returned unchanged.

Internally this calls `withEscalationContext()` from
`src/agents/base/agent-context.ts`, which stores the summary string in the
context under the escalation context key.

### Signature

```typescript
export function withTierEscalationContext(
  context: AgentContext,
  summary: AccumulatedFailureSummary,
): AgentContext
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `context` | `AgentContext` | The current agent context to enrich. |
| `summary` | `AccumulatedFailureSummary` | Failure summary returned by `buildAccumulatedSummary()`. |

**Returns** `AgentContext` — a new context object with the escalation summary
embedded, or the original `context` reference when `summary.naturalLanguageSummary`
is empty.

### Usage example

```typescript
import {
  buildAccumulatedSummary,
  withTierEscalationContext,
} from './src/lifecycle/tier-accumulator';

// After each tier that did not succeed:
const summary = buildAccumulatedSummary(completedTierResults);
const enrichedContext = withTierEscalationContext(currentContext, summary);

// Pass enrichedContext to the next runTier() call:
const { result, finalContext } = await runTier(
  { ...tierCtx, context: enrichedContext },
  runSimpleIteration,
  runFullIteration,
);
```

---

## Lifecycle Flow Diagram

The following sequence shows how all lifecycle components interact during a
multi-tier escalation run:

```
runCommand()
  |
  +-- loadTierConfig(tierConfigFile)       <- TierConfig validation
  |
  +-- createIterationManager(sessionId)    <- Budget + entropy tracking
  |
  +-- createContextMonitor()               <- Token usage tracking
  |     registerAgent('librarian', model)
  |     registerAgent('artisan',   model)
  |     registerAgent('critic',    model)
  |
  +-- createSessionResetter({ sessionId }) <- Context cleanup
  |
  for each tier in tiers:
    |
    +-- buildAccumulatedSummary(priorTierResults)
    |
    +-- withTierEscalationContext(context, summary)
    |
    +-- runTier(tierCtx, runSimpleIteration, runFullIteration)
    |     |
    |     for iteration = 1..tier.maxIterations:
    |       |
    |       +-- isBudgetExceeded(context)   <- check before each iter
    |       |
    |       +-- runSimpleIteration / runFullIteration
    |       |     |
    |       |     +-- ArtisanAgent.run()
    |       |     +-- [LibrarianAgent.run() if mode=full]
    |       |     +-- [CriticAgent.run()    if mode=full]
    |       |     +-- TestRunner.run()
    |       |
    |       +-- contextMonitor.trackTokens()
    |       |
    |       +-- if shouldResetContext():
    |             sessionResetter.reset(iteration)
    |             contextMonitor.reset()
    |
    if tier.success -> stop escalation
    else            -> continue to next tier
```
