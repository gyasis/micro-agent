# System Patterns

**Purpose**: Architecture patterns and design decisions

**Last Updated**: 2026-02-16

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
   temperature (0.3) for deterministic context analysis.

2. **Artisan** (Anthropic Claude `claude-sonnet-4-20250514`): Code generation specialist. Receives
   focused context from Librarian and writes/fixes code. Medium temperature (0.7) for creative
   solutions within bounds.

3. **Critic** (OpenAI `gpt-4o-mini`): Logic review and validation. Checks Artisan's output for
   correctness, edge cases, and potential regressions. Low temperature (0.2) for precise review.

4. **Chaos** (Anthropic Claude): Optional adversarial agent for stress-testing generated code.
   High temperature (0.9) for creative attack vectors.

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
