# Agent Context API Reference

This document describes every exported TypeScript interface and supporting type
defined in `src/agents/base/agent-context.ts`.  These types form the shared
data contract that flows through every agent in the Ralph Loop pipeline:
Librarian → Artisan → Critic → Chaos.

All interfaces are exported from the module and can be imported directly:

```typescript
import type {
  AgentContext,
  LibrarianOutput,
  ArtisanOutput,
  CriticOutput,
  IterationState,
  BudgetConstraints,
  TestContext,
  FileContext,
} from '@builder.io/micro-agent/agents/base/agent-context';
```

---

## `AgentContext`

The root context object.  One instance is created per session and threaded
immutably through every agent invocation.  Helper functions such as
`withLibrarianContext()` and `withArtisanCode()` return updated copies rather
than mutating in place.

```typescript
const ctx = createAgentContext({ ... });
// ctx is passed to LibrarianAgent, then:
const ctx2 = withLibrarianContext(ctx, librarianOutput);
// ctx2 is passed to ArtisanAgent, and so on.
```

| Field                | Type                     | Required | Description                                                                                          |
|----------------------|--------------------------|----------|------------------------------------------------------------------------------------------------------|
| `sessionId`          | `string`                 | Yes      | Unique identifier for the current Ralph Loop session. Used for state persistence and logging.        |
| `iteration`          | `IterationState`         | Yes      | Current iteration counters and phase tracking. See `IterationState` below.                           |
| `budget`             | `BudgetConstraints`      | Yes      | Cost and time limits for the session. See `BudgetConstraints` below.                                 |
| `workingDirectory`   | `string`                 | Yes      | Absolute path to the project root. All relative file paths are resolved against this directory.      |
| `targetFile`         | `string`                 | No       | Path to the primary source file being iterated on. Omitted when the objective is purely descriptive. |
| `relatedFiles`       | `FileContext[]`          | Yes      | Files ranked and loaded by the Librarian agent. Empty array before the first Librarian run.          |
| `objective`          | `string`                 | Yes      | Natural-language description of what the session should achieve.                                     |
| `requirements`       | `string[]`               | No       | Optional list of explicit requirements that must all be satisfied before the loop exits.             |
| `constraints`        | `string[]`               | No       | Optional list of hard constraints (e.g., "do not modify public API").                                |
| `test`               | `TestContext`            | Yes      | Test command and framework selection. See `TestContext` below.                                       |
| `memory`             | `MemoryContext`          | No       | Loaded fix-patterns and test-patterns from the memory vault.                                         |
| `librarianContext`   | `LibrarianOutput`        | No       | Populated after the Librarian agent runs. Undefined on iteration 1.                                  |
| `artisanCode`        | `ArtisanOutput`          | No       | Populated after the Artisan agent runs.                                                              |
| `criticReview`       | `CriticOutput`           | No       | Populated after the Critic agent runs.                                                               |
| `metadata`           | `Record<string, any>`    | No       | Arbitrary key-value bag for plugin or adapter use.                                                   |
| `escalationContext`  | `string`                 | No       | Plain-text failure summary injected when transitioning from simple mode to full pipeline.            |

---

## `IterationState`

Tracks the position of the loop within the current session and the current
execution phase.

| Field              | Type                                                                      | Required | Description                                                                                         |
|--------------------|---------------------------------------------------------------------------|----------|-----------------------------------------------------------------------------------------------------|
| `iteration`        | `number`                                                                  | Yes      | 1-based counter for the current iteration.                                                          |
| `maxIterations`    | `number`                                                                  | Yes      | Hard upper bound on total iterations (default `30`; set via `--max-iterations`).                    |
| `objective`        | `string`                                                                  | Yes      | Copy of the top-level objective string (kept here for agent convenience).                           |
| `currentPhase`     | `'context' \| 'generation' \| 'review' \| 'testing' \| 'adversarial'`    | Yes      | The pipeline phase currently executing. Updated via `updatePhase()`.                                |
| `previousAttempts` | `number`                                                                  | Yes      | Number of full iterations completed before the current one. Used for entropy detection.             |
| `entropy`          | `Map<string, number>`                                                     | Yes      | Maps an error-signature string to the number of consecutive times it has been seen.                 |

**Phase lifecycle**

```
context → generation → review → testing → adversarial → (next iteration)
```

---

## `BudgetConstraints`

Holds the resource limits for the session and the current spend so far.
`isBudgetExceeded()` reads these values to decide whether to halt.

| Field                | Type     | Required | Description                                                                 |
|----------------------|----------|----------|-----------------------------------------------------------------------------|
| `maxCostUsd`         | `number` | Yes      | Maximum total agent spend allowed in USD (default `2.00`).                  |
| `currentCostUsd`     | `number` | Yes      | Running total of all agent API costs in USD. Accumulated by `with*` helpers.|
| `maxDurationMinutes` | `number` | Yes      | Maximum elapsed wall-clock time in minutes (default `15`).                  |
| `startTime`          | `Date`   | Yes      | Timestamp captured when the session was created. Used to compute elapsed time. |

**Budget check logic**

```typescript
// From isBudgetExceeded() — cost OR time triggers a halt:
const costExceeded = context.budget.currentCostUsd >= context.budget.maxCostUsd;
const elapsed = (Date.now() - context.budget.startTime.getTime()) / (1000 * 60);
const timeExceeded = elapsed >= context.budget.maxDurationMinutes;
return costExceeded || timeExceeded;
```

---

## `TestContext`

Specifies how to run the project's test suite and which parser to use for
interpreting output.

| Field        | Type                                                          | Required | Description                                                                          |
|--------------|---------------------------------------------------------------|----------|--------------------------------------------------------------------------------------|
| `command`    | `string`                                                      | Yes      | Shell command to execute (e.g., `"npm test"`, `"pytest -x"`).                        |
| `framework`  | `'vitest' \| 'jest' \| 'pytest' \| 'cargo' \| 'custom'`     | Yes      | Selects the output parser used to extract pass/fail counts and failure details.      |
| `pattern`    | `string`                                                      | No       | Glob pattern restricting which test files are discovered (framework-dependent).      |
| `lastResult` | `TestResult`                                                  | No       | Populated after each test run; `undefined` before the first test execution.          |

---

## `FileContext`

Represents a single source file as ranked and loaded by the Librarian agent.

| Field            | Type       | Required | Description                                                                                |
|------------------|------------|----------|--------------------------------------------------------------------------------------------|
| `path`           | `string`   | Yes      | Absolute or working-directory-relative path to the file.                                   |
| `content`        | `string`   | Yes      | Full text content of the file at the time of Librarian analysis.                           |
| `relevanceScore` | `number`   | No       | Score in `[0, 1]` assigned by the Librarian; higher means more relevant to the objective. |
| `dependencies`   | `string[]` | No       | List of file paths that this file imports or otherwise depends on.                         |
| `lastModified`   | `Date`     | No       | Filesystem modification timestamp at load time.                                            |

**Usage example**

```typescript
// Access the most relevant file from a completed Librarian run:
const topFile = context.relatedFiles.sort(
  (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0)
)[0];
console.log(topFile.path, topFile.relevanceScore);
```

---

## `LibrarianOutput`

Return value from the Librarian agent (Gemini model).  Contains ranked files
and a human-readable context summary for the Artisan.

| Field             | Type               | Required | Description                                                                         |
|-------------------|--------------------|----------|-------------------------------------------------------------------------------------|
| `relevantFiles`   | `FileContext[]`    | Yes      | Ranked list of files the Librarian considers relevant, highest first.               |
| `dependencyGraph` | `DependencyNode[]` | Yes      | Adjacency list representing the import graph centred on the target file.            |
| `contextSummary`  | `string`           | Yes      | Prose summary of what the Librarian found; passed verbatim to the Artisan prompt.   |
| `tokensUsed`      | `number`           | Yes      | Total input + output tokens consumed by the Librarian API call.                     |
| `cost`            | `number`           | Yes      | Cost of this agent call in USD. Added to `budget.currentCostUsd` by `withLibrarianContext()`. |

### `DependencyNode` (supporting type)

| Field        | Type       | Required | Description                                              |
|--------------|------------|----------|----------------------------------------------------------|
| `file`       | `string`   | Yes      | File path for this node.                                 |
| `imports`    | `string[]` | Yes      | Module specifiers imported by this file.                 |
| `exports`    | `string[]` | Yes      | Exported names from this file.                           |
| `dependsOn`  | `string[]` | Yes      | Files this file directly depends on (resolved paths).    |
| `dependedBy` | `string[]` | Yes      | Files that import this file (reverse edges).             |
| `distance`   | `number`   | Yes      | Graph distance from the target file (0 = target itself). |

---

## `ArtisanOutput`

Return value from the Artisan agent (Claude model).  Contains the generated or
modified code and a structured diff of what changed.

| Field        | Type           | Required | Description                                                                             |
|--------------|----------------|----------|-----------------------------------------------------------------------------------------|
| `code`       | `string`       | Yes      | Full source text of the generated or modified file.                                     |
| `filePath`   | `string`       | Yes      | Path of the primary file being written.                                                 |
| `changes`    | `CodeChange[]` | Yes      | Structured list of every file touched in this iteration.                                |
| `reasoning`  | `string`       | Yes      | Artisan's chain-of-thought explanation for the changes made.                            |
| `tokensUsed` | `number`       | Yes      | Total tokens consumed by the Artisan API call.                                          |
| `cost`       | `number`       | Yes      | Cost of this agent call in USD.                                                         |

### `CodeChange` (supporting type)

| Field         | Type                              | Required | Description                                             |
|---------------|-----------------------------------|----------|---------------------------------------------------------|
| `type`        | `'create' \| 'modify' \| 'delete'` | Yes     | Nature of the change.                                   |
| `file`        | `string`                          | Yes      | File path affected.                                     |
| `before`      | `string`                          | No       | Content before the change (omitted for new files).      |
| `after`       | `string`                          | No       | Content after the change (omitted for deletions).       |
| `description` | `string`                          | Yes      | One-line human-readable description of the change.      |

---

## `CriticOutput`

Return value from the Critic agent (GPT model).  Contains a structured review
with per-issue severity and category tags.

| Field                | Type            | Required | Description                                                                                   |
|----------------------|-----------------|----------|-----------------------------------------------------------------------------------------------|
| `approved`           | `boolean`       | Yes      | `true` if the Critic considers the code ready for testing; `false` triggers another iteration.|
| `issues`             | `ReviewIssue[]` | Yes      | Ordered list of identified issues (may be empty when `approved` is `true`).                   |
| `suggestions`        | `string[]`      | Yes      | Free-form improvement suggestions that do not block approval.                                 |
| `overallAssessment`  | `string`        | Yes      | Prose summary of the review outcome.                                                          |
| `tokensUsed`         | `number`        | Yes      | Total tokens consumed by the Critic API call.                                                 |
| `cost`               | `number`        | Yes      | Cost of this agent call in USD.                                                               |

### `ReviewIssue` (supporting type)

| Field        | Type                                                                            | Required | Description                                                  |
|--------------|---------------------------------------------------------------------------------|----------|--------------------------------------------------------------|
| `severity`   | `'critical' \| 'warning' \| 'info'`                                            | Yes      | `critical` issues must be resolved before testing proceeds.  |
| `category`   | `'logic' \| 'edge-case' \| 'performance' \| 'maintainability' \| 'security'`  | Yes      | Classification used for filtering and reporting.             |
| `message`    | `string`                                                                        | Yes      | Human-readable description of the issue.                     |
| `file`       | `string`                                                                        | No       | File path where the issue was identified.                    |
| `line`       | `number`                                                                        | No       | Line number of the issue in `file`.                          |
| `suggestion` | `string`                                                                        | No       | Inline fix suggestion from the Critic.                       |

---

## Helper functions

The module also exports several pure functions for building and updating context
objects immutably.

| Function                   | Signature                                                   | Description                                                                    |
|----------------------------|-------------------------------------------------------------|--------------------------------------------------------------------------------|
| `createAgentContext(opts)`  | `(options: {...}) => AgentContext`                          | Constructs a fresh `AgentContext` for the start of a session.                  |
| `updatePhase(ctx, phase)`   | `(AgentContext, phase) => AgentContext`                     | Returns a new context with `iteration.currentPhase` updated.                  |
| `withLibrarianContext(ctx, out)` | `(AgentContext, LibrarianOutput) => AgentContext`      | Merges Librarian output and accumulates its cost into `budget.currentCostUsd`. |
| `withArtisanCode(ctx, out)` | `(AgentContext, ArtisanOutput) => AgentContext`             | Merges Artisan output and accumulates cost.                                    |
| `withCriticReview(ctx, out)` | `(AgentContext, CriticOutput) => AgentContext`             | Merges Critic output and accumulates cost.                                     |
| `withTestResults(ctx, res)` | `(AgentContext, any) => AgentContext`                       | Converts raw test runner output into a `TestResult` and stores it on `test.lastResult`. |
| `withEscalationContext(ctx, summary)` | `(AgentContext, string) => AgentContext`        | Attaches a plain-text failure summary from simple mode to `escalationContext`. |
| `isBudgetExceeded(ctx)`     | `(AgentContext) => boolean`                                 | Returns `true` if cost OR time limits have been reached.                       |

**createAgentContext options**

| Option               | Type                         | Required | Description                                  |
|----------------------|------------------------------|----------|----------------------------------------------|
| `sessionId`          | `string`                     | Yes      | Unique session identifier.                   |
| `iteration`          | `number`                     | Yes      | Starting iteration number (usually `1`).     |
| `maxIterations`      | `number`                     | Yes      | Hard iteration cap.                          |
| `objective`          | `string`                     | Yes      | Natural-language goal for the session.       |
| `workingDirectory`   | `string`                     | Yes      | Absolute path to the project root.           |
| `testCommand`        | `string`                     | Yes      | Shell command to run tests.                  |
| `testFramework`      | `TestContext['framework']`   | Yes      | Parser to use for test output.               |
| `maxCostUsd`         | `number`                     | Yes      | Cost cap in USD.                             |
| `maxDurationMinutes` | `number`                     | Yes      | Time cap in minutes.                         |
| `targetFile`         | `string`                     | No       | Primary source file path.                    |
| `requirements`       | `string[]`                   | No       | Explicit requirements list.                  |

**Example — building a context from scratch**

```typescript
import { createAgentContext, withLibrarianContext, isBudgetExceeded }
  from './src/agents/base/agent-context';

const ctx = createAgentContext({
  sessionId: 'session-001',
  iteration: 1,
  maxIterations: 30,
  objective: 'Fix all failing tests in src/math.ts',
  workingDirectory: '/home/user/project',
  testCommand: 'npm test',
  testFramework: 'vitest',
  maxCostUsd: 2.0,
  maxDurationMinutes: 15,
  targetFile: 'src/math.ts',
});

// After Librarian runs:
const ctx2 = withLibrarianContext(ctx, librarianOutput);
console.log(ctx2.budget.currentCostUsd); // Librarian cost accumulated

if (isBudgetExceeded(ctx2)) {
  throw new Error('Budget exceeded before Artisan could run');
}
```
