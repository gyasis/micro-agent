# CLAUDE.md - Micro Agent Project Intelligence

This file captures project-specific patterns, critical implementation paths, and workflow
intelligence for the Micro Agent project (`@builder.io/micro-agent`).

## Project Identity

- **Name**: Micro Agent (powered by Ralph Loop 2026)
- **Package**: `@builder.io/micro-agent` v0.1.5
- **Branch**: `001-ralph-loop-2026` -> merging to `main`
- **Status as of 2026-02-16**: All 216 tests passing, E2E verified, production-ready

## Critical Implementation Rules

### 1. XState v5 API (DO NOT use v4 pattern)

```typescript
// CORRECT (v5):
import { createActor } from 'xstate';
const actor = createActor(machine);
actor.start();
const context = actor.getSnapshot().context;

// WRONG (v4, will cause runtime errors or type errors):
const context = machine.context;
```

### 2. Model Names (2026-Current - verify before changing)

| Agent     | Model                      |
|-----------|----------------------------|
| Librarian | gemini-2.5-flash           |
| Artisan   | claude-sonnet-4-20250514   |
| Critic    | gpt-4o-mini                |

Do NOT use: `gemini-2.0-pro`, `claude-sonnet-4.5`, `gpt-4.1-mini`

### 3. SessionResetter Constructor

```typescript
// CORRECT:
new SessionResetter({ sessionId: string, verbose: boolean })

// WRONG (runtime crash):
new SessionResetter(sessionId)
```

### 4. ContextMonitor Registration (REQUIRED)

Every agent MUST be registered before use in `src/cli/commands/run.ts`:
```typescript
contextMonitor.registerAgent('librarian');
contextMonitor.registerAgent('artisan');
contextMonitor.registerAgent('critic');
```

### 5. dotenv Loading Location

The `config()` from `dotenv` MUST be called at the top of `src/cli/ralph-loop.ts`
(CLI entry point) BEFORE any other imports that might read process.env:
```typescript
import { config } from 'dotenv';
config({ path: process.cwd() + '/.env' });
```

### 6. Budget Check Logic

`isBudgetExceeded()` in `src/agents/base/agent-context.ts` checks cost ONLY.
The `iteration >= maxIterations` check was a bug and has been removed.

### 7. Test Framework Detection

`TestRunner.detectFramework()` MUST run even when a custom test command is provided.
This ensures the correct output parser is selected.

## Memory Bank Rules

- Only the `memory-bank-keeper` agent (this role) may modify the `/memory-bank/` folder
- No other agent including default Claude may touch the memory-bank folder
- Memory bank path: `/home/gyasis/Documents/code/micro-agent/memory-bank/`

## Project Workflow

### To Run Tests
```bash
npm test
```
Expected: 216 tests passing, ~4s

### To Run E2E (requires .env with API keys)
```bash
npx ralph-loop run ./src/math.ts --test "npm test" --verbose
```

### To Create PR (pending task #4)
```bash
gh pr create --base main --head 001-ralph-loop-2026 \
  --title "feat: Ralph Loop 2026 multi-agent system" \
  --body "..."
```

## Architecture at a Glance

```
CLI Entry: src/cli/ralph-loop.ts
  -> run command: src/cli/commands/run.ts
    -> IterationManager (src/lifecycle/iteration-manager.ts)
      -> ContextMonitor (40% smart zone tracking)
      -> SessionResetter (fresh context each iteration)
      -> StatePersister (disk between iterations)
      -> LibrarianAgent (Gemini - context gathering)
      -> ArtisanAgent (Claude - code generation)
      -> CriticAgent (GPT - code review)
      -> TestRunner (src/testing/test-runner.ts)
      -> BudgetEnforcer
      -> EntropyDetector (stagnation detection)
```

## Pending Work

1. **Task #3**: Write `docs/api/` directory with API reference documentation
2. **Task #4**: Create PR merging `001-ralph-loop-2026` to `main`

## Important File Paths

| Purpose                    | Path                                        |
|----------------------------|---------------------------------------------|
| CLI entry point            | `src/cli/ralph-loop.ts`                     |
| Run command                | `src/cli/commands/run.ts`                   |
| Default config             | `src/config/defaults.ts`                    |
| Agent context              | `src/agents/base/agent-context.ts`          |
| ContextMonitor             | `src/lifecycle/context-monitor.ts`          |
| SessionResetter            | `src/lifecycle/session-resetter.ts`         |
| TestRunner                 | `src/testing/test-runner.ts`                |
| State machine              | `src/state-machine/ralph-machine.ts`        |
| Tutorials                  | `docs/tutorials/`                           |

## Active Technologies
- TypeScript 5.x (Node.js 20+) + commander (CLI), existing ArtisanAgent, TestRunner, AgentContext — all already in place (002-simple-escalation)
- In-memory only (FailureSummary never written to disk) (002-simple-escalation)
- SQLite (best-effort append-only audit log at `.micro-agent/audit.db`) (003-tiered-escalation)
- TypeScript (upgrading from 4.9.5 → 5.9.3), Node.js 18+ + zod ^3.x, chromadb, better-sqlite3, xstate v5, commander (004-fix-outstanding-issues)
- SQLite (audit log, best-effort), ChromaDB (optional vector store) (004-fix-outstanding-issues)
- TypeScript 5.9.3 (Node.js 18+) + `glob` v10 (already installed), `fs/promises` (built-in), (005-unified-test-gen)
- Disk only — generates one `.test.{ext}` file per invocation (005-unified-test-gen)

## Recent Changes
- 002-simple-escalation: Added TypeScript 5.x (Node.js 20+) + commander (CLI), existing ArtisanAgent, TestRunner, AgentContext — all already in place
