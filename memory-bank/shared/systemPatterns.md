# System Patterns

**Purpose**: Architecture patterns and design decisions

**Last Updated**: 2026-02-22 (005-unified-test-gen)

## Ralph Principles (LLM Smart Zone Optimization)

**Core Insight**: LLMs perform best in short, fresh bursts, not long conversations.

### The Two-Zone Problem

- **Smart Zone**: First 30-40% of context (focused, precise, good decisions)
- **Dumb Zone**: Beyond 40% of context (confused, error-prone, degraded quality)

### How This Project Implements Ralph

1. **Frequent Git Commits**: Externalize state to git, not conversation memory
2. **Wave-Based Execution**: Each wave = one iteration (discrete work unit)
3. **Memory Bank as PRD**: Requirements persist outside context window
4. **Session Snapshots**: Resume points without context bloat
5. **GitHub Issues as Tasks**: External tracking enables crash recovery

### Agent Guidelines (CRITICAL)

DO:
- Commit to git after EVERY logical change (not just wave completion)
- Read git history + Memory Bank instead of scrolling conversation
- If context feels bloated (>80K tokens), finalize and recall
- Complete one wave, then checkpoint
- Trust the codebase as memory, not conversation history

DO NOT:
- Try to remember everything in conversation
- Do multiple waves in one session
- Continue when context approaches 100K tokens
- Skip commits to "batch" changes

### Context Budget Targets

- **Optimal**: <60K tokens (30% of 200K window)
- **Warning**: 60-80K tokens (30-40%)
- **Critical**: >80K tokens (>40% - finalize immediately)

---

## Architecture Patterns

### Multi-Agent Orchestration Pattern

Three specialized agents run in sequence each iteration:

1. **Librarian** (Google Gemini `gemini-2.5-flash`): Large context window used to gather and rank
   relevant code files, build dependency graphs, and provide context to other agents. Low
   temperature (0.3) for deterministic context analysis. When `escalationContext` is set on
   `AgentContext`, Librarian prepends a "PRIOR ATTEMPTS:" header to its Gemini prompt so it
   starts informed about what simple mode already tried.

2. **Artisan** (Anthropic Claude `claude-sonnet-4-20250514`): Code generation specialist. Receives
   focused context from Librarian and writes/fixes code. Medium temperature (0.7) for creative
   solutions within bounds. Also the sole agent used in Simple Mode (no Librarian, no Critic).

3. **Critic** (OpenAI `gpt-4o-mini`): Logic review and validation. Checks Artisan's output for
   correctness, edge cases, and potential regressions. Low temperature (0.2) for precise review.
   Skipped in Simple Mode.

4. **Chaos** (Anthropic Claude): Optional adversarial agent for stress-testing generated code.
   High temperature (0.9) for creative attack vectors.

### Two-Phase Execution Pattern (002-simple-escalation)

The default execution model uses two phases with automatic escalation:

**Phase A - Simple Mode** (`--simple [N]`, default N=5):
- Runs Artisan + Tests only (skips Librarian and Critic)
- Faster and cheaper for easy problems (no Gemini context gathering, no GPT review)
- Succeeds immediately if any iteration passes tests
- Tracks `SimpleIterationRecord[]` (one per attempt)

**Phase B - Escalation Gate** (automatic, unless `--no-escalate`):
- Triggered when Phase A exhausts all N iterations without passing
- Calls `buildFailureSummary(records)` to compress history into a `naturalLanguageSummary`
  (2000-char hard cap)
- Calls `withEscalationContext(agentCtx, summary)` -- immutable, returns new `AgentContext`
- The enriched context flows into Phase C

**Phase C - Full Mode**:
- Runs full Librarian + Artisan + Critic + Tests pipeline
- Librarian receives "PRIOR ATTEMPTS:" header in its Gemini prompt
- Budget is shared across Phase A and Phase C (no per-phase split)
- Context reset per iteration within Phase C (Ralph Loop principle preserved)

**CLI flags (registered in `src/cli/ralph-loop.ts`)**:
- `--simple [N]` : default behavior, N simple iterations then escalate (N defaults to 5)
- `--no-escalate` : run only Phase A, never escalate to full mode
- `--full` : bypass Phase A entirely, run only full mode (pre-002 behavior)

### N-Tier Model Escalation Pattern (003-tiered-escalation)

An optional execution mode activated by `--tier-config <path>`. The tier config defines N tiers,
each with its own model set and iteration budget. Tiers run sequentially; if a tier passes tests,
the loop exits immediately. If a tier exhausts its budget, accumulated failure context is injected
into the next tier before it starts.

**Tier Config Schema (Zod-validated)**:
```yaml
# example ralph-tiers.yaml
tiers:
  - name: "fast-cheap"
    mode: simple          # or "full"
    models:
      artisan: "gpt-4o-mini"
    maxIterations: 3
    maxCost: 0.10
  - name: "full-power"
    mode: full
    models:
      librarian: "gemini-2.5-flash"
      artisan: "claude-sonnet-4-20250514"
      critic: "gpt-4o-mini"
    maxIterations: 5
    maxCost: 0.50
```

**Key interfaces** (in `src/lifecycle/types.ts`):
- `TierConfig` -- one tier definition (name, mode, models, maxIterations, maxCost)
- `TierModels` -- optional per-tier model overrides (librarian, artisan, critic)
- `TierEscalationConfig` -- top-level config wrapper (array of TierConfig)
- `TierGlobal` -- optional global overrides (maxTotalCost, maxTotalIterations)
- `TierAttemptRecord` -- one record per iteration within a tier
- `RunMetadataRow` -- SQLite row for run-level metadata
- `AccumulatedFailureSummary` -- output of `buildAccumulatedSummary()`, 4000-char cap
- `TierRunResult` -- result of one tier run (passed, totalCost, attempts, etc.)

**Tier Engine** (`src/lifecycle/tier-engine.ts`):
- `runTier(tierCtx, runSimpleIteration, runFullIteration?)` runs one tier's iteration loop
- Prints per-tier header: `━━━━ ▶ Tier N/total: name [mode, model] ━━━━`
- Returns `TierRunResult` (passed=true exits whole chain, passed=false continues to next tier)
- Records a `TierAttemptRecord` for every iteration

**Tier Accumulator** (`src/lifecycle/tier-accumulator.ts`):
- `buildAccumulatedSummary(priorResults[])` concatenates all prior tier failure summaries with
  a 4000-char hard cap (double the 2000-char cap used by two-phase escalation)
- `withTierEscalationContext(context, summary)` injects accumulated history into the next
  tier's `AgentContext.escalationContext` (same field used by two-phase escalation)

**Tier DB** (`src/lifecycle/tier-db.ts`):
- SQLite audit log via `better-sqlite3`; functions: `openAuditDatabase`, `writeAttemptRecord`,
  `writeRunMetadata`, `updateRunMetadata`, `closeAuditDatabase`
- All DB operations are best-effort: wrapped in try/catch, never throw to caller
- DB failures are logged as warnings but do not abort the run

**CLI Integration** (`src/cli/commands/run.ts`):
- New `runTierLoop()` function detects `--tier-config` flag, loads/validates config via
  `loadTierConfig()`, prints a startup banner table, runs N-tier loop, injects accumulated
  failure context between tiers, produces multi-tier final report, writes SQLite audit DB
- Conflict detection: warns when `--tier-config` is used alongside `--simple`, `--full`, or
  `--no-escalate` (tier config takes precedence)

**Backward Compatibility**:
- `--tier-config` is entirely opt-in; default two-phase behavior (`--simple / --full`) is
  unchanged when the flag is absent
- Escalation is OPTIONAL; if not specified, default simple/full mode works without any change

### Test Generation Before Loop Pattern (005-unified-test-gen)

An optional pre-loop step that auto-generates a test file when none exists for the target file.
Activated by default; disabled with `--no-generate`. Runs after `prepareRunParameters()` and
before `initializeInfrastructure()` in `src/cli/commands/run.ts`.

**Flow**:
1. `findExistingTests(targetFile, workingDir)` checks for `.test.{ext}`, `.spec.{ext}`,
   `test_{name}.{ext}`, and `{name}_spec.{ext}` patterns in the target's directory.
2. If a test file already exists: logs "Using existing tests: <path>", no generation.
3. If no test file exists (and not skipped): calls `generateTestFile(options)` which:
   - Resolves the output path via `resolveTestFilePath()` (returns `null` for `.rs`, skips Rust)
   - Reads the source file
   - Gathers up to 2 existing test files from the working directory as style examples
   - Reads `package.json` for framework context as fallback when no examples found
   - Calls `ProviderRouter.complete()` with `provider:'anthropic'` and `claude-sonnet-4-20250514`
   - Extracts the code block from the LLM response
   - Writes the generated test file to disk
   - Returns `{ testFilePath, testCommand, generated: true }`
4. `params.testCommand` is updated to a scoped command targeting only the generated file.

**Skip conditions**:
- `options.generate === false` (`--no-generate` flag)
- `options.test` already set by the user (`--test` flag)
- Target file has `.rs` extension (Rust: inline `#[test]`, cannot auto-generate external file)
- `!params.targetFile` (objective-only mode, no file target)
- Any exception during generation: warns and continues without generated tests

**Language-aware naming** (via `resolveTestFilePath()`):
- `.ts` -> `{name}.test.ts` (same directory)
- `.js` -> `{name}.test.js` (same directory)
- `.py` -> `test_{name}.py` (same directory)
- `.rs` -> `null` (always skip)
- `.rb` -> `{name}_spec.rb` (same directory)
- other -> `{name}.test.{ext}` (same directory)

**Scoped test command** (via `buildTestCommand()`):
- vitest -> `npx vitest run {basename-no-ext}`
- jest -> `npx jest {basename-no-ext} --no-watch`
- pytest -> `pytest {relativeTestFilePath}`
- mocha -> `npx mocha {testFilePath}`
- rspec -> `bundle exec rspec {testFilePath}`
- cargo/custom -> `npm test` fallback

**Key module**: `src/helpers/test-generator.ts`

---

### speckit + devkid Feature Workflow (005-unified-test-gen)

The standard workflow for implementing a new feature in this project now uses the full
speckit + devkid pipeline. This was first used end-to-end in 005-unified-test-gen.

**Phases**:

1. **speckit.specify** -> `specs/{branch}/spec.md`
   - Captures requirements, acceptance criteria, user stories

2. **speckit.plan** -> `specs/{branch}/plan.md` + supporting files:
   - `research.md` (technical investigation, alternatives considered)
   - `data-model.md` (interface/type definitions)
   - `contracts/` (API contracts between modules)
   - `quickstart.md` (smoke test checklist)

3. **speckit.tasks** -> `specs/{branch}/tasks.md`
   - Numbered tasks organized into implementation phases
   - Each task has acceptance gate criteria
   - 005 had 26 tasks in 8 phases (28 tasks with 2 validation/commit tasks)

4. **devkid.orchestrate** -> `execution_plan.json`
   - Groups tasks into parallel/sequential execution waves
   - Defines checkpoints between waves
   - 005 had 8 execution waves

5. **devkid.execute** -> commits each wave
   - Each wave is a discrete git checkpoint: `[CHECKPOINT] Wave N Complete`
   - On completion: 0 TypeScript errors, all tests passing

**Benefits**:
- Spec-driven: requirements captured before implementation begins
- Wave isolation: if a wave fails, rollback to prior checkpoint is clean
- Audit trail: every wave is a git commit with clear scope
- Memory-bank compatible: task list survives session resets via disk

---

### State Machine Pattern (XState v5)

States: `librarian` -> `artisan` -> `critic` -> `testing` -> (loop or `completion`)

Key implementation requirement: Use XState v5 API pattern:
```typescript
// CORRECT (v5):
const actor = createActor(machine);
actor.start();
const snapshot = actor.getSnapshot();
const ctx = snapshot.context;

// WRONG (v4, do not use):
const ctx = machine.context;
```

### Context Monitor Pattern

`ContextMonitor` in `src/lifecycle/context-monitor.ts` tracks token usage per agent. Each agent
MUST be registered with `contextMonitor.registerAgent(agentId)` before use (this was a critical
bug that was fixed -- see Known Gotchas).

### Fresh Session Pattern

`SessionResetter` destroys LLM conversation context between iterations. Constructor signature:
```typescript
new SessionResetter({ sessionId: string, verbose: boolean })
```
Not just `new SessionResetter(sessionId)` -- this was a critical bug (see Known Gotchas).

### Test Framework Detection Pattern

`TestRunner` in `src/testing/test-runner.ts` always runs `detectFramework()` to select the
correct test output parser, EVEN when a custom test command is provided. This ensures correct
pass/fail parsing regardless of command override.

---

## Design Decisions

- **XState v5 over v4**: v5 actor model provides better TypeScript types and separation of machine
  definition from execution state
- **dotenv at Entry Point**: `config()` called at the top of `src/cli/ralph-loop.ts` to load from
  `process.cwd()/.env` -- must happen before any module imports that read env vars
- **Provider Abstraction via ProviderRouter**: All LLM calls go through `ProviderRouter` so that
  provider switching, fallback, and cost tracking are centralized
- **Zod for Config Validation**: All configuration is validated at load time via Zod schemas in
  `src/config/schema-validator.ts`
- **Immutable AgentContext Updates**: `withEscalationContext()` returns a new `AgentContext`
  object rather than mutating in place. This prevents cross-iteration context bleed and preserves
  the Ralph Loop principle that each iteration starts fresh.
- **2000-char Summary Cap**: `buildFailureSummary()` truncates its `naturalLanguageSummary` output
  at 2000 characters. This limits token overhead when escalation context is injected into the
  Librarian's Gemini prompt without creating a runaway context bloat problem.
- **Default = Simple Mode**: The default CLI behavior is `--simple 5` (five simple iterations
  then auto-escalate). This is explicitly chosen over defaulting to full mode because simple mode
  resolves the majority of easy bugs much more cheaply.

- **Tier Escalation is Opt-In**: `--tier-config` enables the N-tier loop; its absence leaves the
  two-phase behavior entirely unchanged. This design ensures the feature adds zero overhead to
  existing workflows.

- **4000-char Accumulated Summary Cap**: Tier accumulator uses 4000 chars (vs 2000 for simple-mode
  summary) because tier runs may span many more iterations across multiple tiers. The larger cap
  prevents truncation of critical diagnostic information while still bounding prompt growth.

- **Best-Effort SQLite Audit DB**: Tier DB writes are intentionally never allowed to throw. A
  monitoring/audit capability should never be the reason a code-fixing run fails.

- **`validateTierConfig()` Returns All Errors**: Unlike many Zod usage patterns that surface
  only the first error, `validateTierConfig()` collects and returns all ZodIssues. This enables
  the CLI to display a complete list of config problems in a single run, not one-at-a-time.

---

## Known Gotchas

- **XState v5 API**: Never use `machine.context` directly (v4 pattern). Always use
  `createActor(machine).getSnapshot().context` (v5 pattern). Tests in
  `tests/unit/lifecycle/iteration-manager.test.ts` and `tests/e2e/context-freshness.test.ts`
  had to be updated for this.

- **ContextMonitor.registerAgent() Missing**: In `src/cli/commands/run.ts`, every agent (librarian,
  artisan, critic) MUST call `contextMonitor.registerAgent(agentId)` before use. Skipping this
  causes silent failures where token tracking does not work.

- **SessionResetter Constructor**: Takes an options object `{ sessionId, verbose }`, NOT a bare
  string. Calling `new SessionResetter(sessionId)` throws a runtime error.

- **Model Names Are Date-Specific**: The 2026-correct model names are:
  - `gemini-2.5-flash` (NOT `gemini-2.0-pro`)
  - `claude-sonnet-4-20250514` (NOT `claude-sonnet-4.5`)
  - `gpt-4o-mini` (NOT `gpt-4.1-mini`)
  Always verify model names against provider documentation for the current date.

- **isBudgetExceeded() False Positive**: The `isBudgetExceeded()` function in
  `src/agents/base/agent-context.ts` previously had an erroneous check `iteration >= maxIterations`
  that caused premature budget exhaustion. This was removed. Budget is now cost-only.

- **dotenv Loading**: The `.env` file must be loaded explicitly via `config()` at the CLI entry
  point. Sub-modules relying on `process.env` won't see values unless this is called first.

- **Test Framework Parser Selection**: `TestRunner` must call `detectFramework()` regardless of
  whether a custom test command was supplied. Without this, the parser defaults to a generic
  parser that may misread pass/fail counts.

- **Escalation Context Interfaces** (in `src/lifecycle/types.ts`):
  - `SimpleIterationRecord` -- one record per simple-mode attempt
  - `FailureSummary` -- output of `buildFailureSummary()`, contains `naturalLanguageSummary`
  - `EscalationEvent` -- timestamp + trigger reason + iteration count at escalation point

- **withEscalationContext() is Immutable**: Always returns a new `AgentContext`. Never mutates
  the existing context object. When writing new features that extend `AgentContext`, follow this
  same pattern (pure function returning a new object).

- **buildFailureSummary() 2000-char Cap**: The `naturalLanguageSummary` field is hard-capped at
  2000 characters. Do not remove this cap -- it exists to prevent Librarian's Gemini prompt from
  growing unbounded on long simple-mode runs.

- **Budget is Shared Across Phases**: Phase A and Phase C share the same budget counter in
  `AgentContext`. There is no per-phase budget split. A long Phase A that nearly exhausts the
  budget will leave little room for Phase C.

- **Zod v3 SafeParseError uses `.issues` not `.errors`**: When calling `schema.safeParse()` and
  checking the result, the validation errors are at `result.error.issues` (array of ZodIssue),
  NOT `result.error.errors`. Using `.errors` will be `undefined`. This affects
  `src/lifecycle/tier-config.ts` and `validateTierConfig()`.

- **Accumulated Summary 4000-char Cap**: `buildAccumulatedSummary()` in
  `src/lifecycle/tier-accumulator.ts` uses a 4000-char cap (vs 2000 for simple-mode summary).
  The larger cap is intentional -- tier runs accumulate more history across more tiers.

- **Tier DB is Best-Effort**: All functions in `src/lifecycle/tier-db.ts` are wrapped in
  try/catch. A SQLite open failure, write failure, or close failure is logged as a warning but
  never throws. The run continues regardless of DB state.

- **Tier Config Conflict Warnings**: When `--tier-config` is present alongside `--simple`,
  `--full`, or `--no-escalate`, `run.ts` logs a conflict warning. The tier config always wins.
  These flags are not silently ignored -- the warning is intentional to surface misconfiguration.

- **Fresh Context Per Tier Iteration**: The gold standard Ralph Loop principle (fresh context
  per iteration) is preserved inside each tier. Tier history is injected as a summary string
  via `escalationContext` at tier start, NOT as conversation history. Each iteration within a
  tier still starts with a clean LLM session.

- **Test Generation Uses ProviderRouter.complete() Not getSimpleCompletion()**: The test
  generator in `src/helpers/test-generator.ts` calls `new ProviderRouter().complete({...})`
  with `provider:'anthropic'` and the configured artisan model. The older `getSimpleCompletion()`
  helper has a different signature and is being phased out. Always use `ProviderRouter.complete()`
  for new LLM call sites.

- **Test Generation is Pre-Loop, Not In-Loop**: The `generateTestFile()` call happens once,
  before the Ralph Loop starts. It is NOT called on every iteration. Once the test file is
  written and `params.testCommand` is updated, the loop runs exactly as if the user had provided
  the test command manually.

- **Scoped Test Command After Generation**: When a test file is auto-generated, the test command
  is scoped to that specific file (e.g., `npx vitest run math.test`), NOT the full suite
  (`npm test`). This is critical: running 303 tests on every loop iteration when only one file
  is being fixed would be extremely slow and expensive.

- **Dynamic Import Pattern in run.ts**: `test-generator.ts` is imported via a dynamic `import()`
  call inside the generation block, matching the pattern used for `runSimpleIteration`. This
  avoids any risk of circular imports between the CLI orchestration layer and helper modules.

- **Rust Test Generation is Always Skipped**: `.rs` files return `null` from
  `resolveTestFilePath()` and the generation block treats `null` as a skip signal. Rust uses
  inline `#[test]` modules that require understanding the full crate structure. Attempting to
  auto-generate Rust tests without that context produces broken code. Users writing Rust must
  provide their own test files and pass `--test cargo test` explicitly.
