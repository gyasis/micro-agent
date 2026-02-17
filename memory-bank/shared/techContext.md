# Technical Context

**Purpose**: Technical constraints and environment

**Last Updated**: 2026-02-17 (003-tiered-escalation)

## Tech Stack

- **Language**: TypeScript (ES2022 target, Node.js 20+)
- **Package**: `@builder.io/micro-agent` v0.1.5
- **State Machine**: XState v5 (actor model)
- **Test Framework**: Vitest
- **Config Validation**: Zod
- **Vector DB**: ChromaDB (for MemoryVault)
- **CLI Framework**: Commander.js + Cleye + Clack prompts

## LLM Providers & Models (2026-Current)

| Agent     | Provider  | Model                      | Temperature |
|-----------|-----------|----------------------------|-------------|
| Librarian | Google    | gemini-2.5-flash           | 0.3         |
| Artisan   | Anthropic | claude-sonnet-4-20250514   | 0.7         |
| Critic    | OpenAI    | gpt-4o-mini                | 0.2         |
| Chaos     | Anthropic | claude-sonnet-4-20250514   | 0.9         |

## Key Dependencies

- `@anthropic-ai/sdk` - Claude API client
- `@google/generative-ai` - Gemini API client
- `openai` - OpenAI API client
- `@huggingface/inference` - HuggingFace client (alternative/fallback)
- `xstate` v5 - State machine
- `chromadb` - Vector database for MemoryVault
- `zod` - Runtime schema validation
- `vitest` - Test runner
- `commander` - CLI framework
- `dotenv` - Environment variable loading
- `@dqbd/tiktoken` - Token counting
- `uuid` - Session ID generation
- `better-sqlite3` - Synchronous SQLite3 bindings (added in 003-tiered-escalation for tier audit DB)

## Project Directory Structure

```
src/
  agents/
    base/          # Base agent interface and context
    librarian/     # Librarian agent (Gemini)
    artisan/       # Artisan agent (Claude)
    critic/        # Critic agent (GPT)
    chaos/         # Chaos/adversarial agent
    local-guard/   # Local validation utilities
  lifecycle/
    iteration-manager.ts   # Orchestrates the loop
    context-monitor.ts     # Token usage tracking
    state-persister.ts     # Disk state between iterations
    session-resetter.ts    # Context reset between iterations
    entropy-detector.ts    # Detects stagnation
    entropy-memory-integration.ts
    completion-report.ts
    completion-status.ts
    budget-enforcer.ts
    ralph-loop.ts          # Ralph Loop core
    types.ts               # SimpleIterationRecord, FailureSummary, EscalationEvent (002);
                           #   TierConfig, TierModels, TierEscalationConfig, TierGlobal,
                           #   TierAttemptRecord, RunMetadataRow, AccumulatedFailureSummary,
                           #   TierRunResult (all added in 003-tiered-escalation)
    tier-config.ts         # Zod schemas + loadTierConfig() + validateTierConfig() (003)
    tier-engine.ts         # runTier() N-tier iteration loop with per-tier header logs (003)
    tier-accumulator.ts    # buildAccumulatedSummary() + withTierEscalationContext() (003)
    tier-db.ts             # SQLite audit log via better-sqlite3; best-effort (003)
  state-machine/
    ralph-machine.ts       # XState v5 machine definition
    ralph-orchestrator.ts  # Orchestrator using state machine
    transitions.ts
    guards.ts
    success-criteria.ts
    test-executor.ts
  memory/                  # MemoryVault (ChromaDB-backed)
  parsers/                 # Language-specific test output parsers
  llm/
    provider-router.ts     # Multi-provider abstraction
    cost-tracker.ts        # Per-iteration cost tracking
    fallback-handler.ts    # Provider failover logic
  config/
    schema-validator.ts    # Zod schemas
    config-loader.ts       # Auto-discovery loader
    defaults.ts            # Default configuration
  cli/
    ralph-loop.ts          # CLI entry point (loads dotenv here); --simple/--no-escalate/--full flags
    commands/
      run.ts               # Main run command; 3-phase loop (Phase A/B/C); runSimpleIteration();
                           #   buildFailureSummary(); per-phase cost tracking (rewritten in 002)
      config.ts            # Config inspection command
      status.ts            # Status command
      reset.ts             # Reset command
  testing/
    test-runner.ts         # Test execution and parser selection
  utils/
    logger.ts              # Structured logger
    file-io.ts             # Atomic file I/O
    git-utils.ts           # Git working tree utilities

tests/
  unit/
    agents/                # Unit tests for each agent
    lifecycle/             # Lifecycle component tests
                           #   simple-escalation.test.ts (13 tests, added in 002)
                           #   tier-config.test.ts (unit tests for Zod schemas + loader, 003)
                           #   tier-accumulator.test.ts (unit tests for accumulator, 003)
                           #   tier-db.test.ts (unit tests for SQLite audit DB, 003)
    memory/                # MemoryVault tests
    parsers/               # Parser tests
  integration/             # Integration tests
                           #   escalation-flow.test.ts (19 tests, T015/T023/T027, added in 002)
                           #   tier-engine.test.ts (integration tests for N-tier loop, 003)
  e2e/
    context-freshness.test.ts   # E2E context reset verification
    typescript-project.test.ts  # TypeScript project E2E
    python-project.test.ts      # Python project E2E

docs/
  tutorials/
    typescript-javascript.md
    python.md
    rust.md
    model-configuration.md   # Added 2026-02-16; updated 003 with N-tier escalation section
    micro-agent-complete-walkthrough.ipynb  # Jupyter notebook; Part 13 added in 003
  api/                       # NOT YET WRITTEN
```

## Environment Setup

Required `.env` file in working directory:
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AI...
```

The `config()` call at the top of `src/cli/ralph-loop.ts` loads from `process.cwd()/.env`.

## Build System

- `npm run build` - TypeScript compile to `dist/`
- `npm test` - Run Vitest (all 269 tests as of 2026-02-17, +22 from 003-tiered-escalation)
- `npm run lint` - ESLint
- `npm run format` - Prettier

## Supported Languages

- TypeScript/JavaScript (vitest, jest)
- Python (pytest)
- Rust (cargo test)
- Custom (any command with detectable output)

## Git Branch Status (2026-02-17)

- **Active branch**: `main`
- **001-ralph-loop-2026**: merged to main (commit `c527da1`)
- **002-simple-escalation**: merged to main (feature commit `ec7e7c6`, merge commit `8d42927`)
- **003-tiered-escalation**: merged to main via no-ff merge commit (all 31 tasks complete)
  - Key commits: `b1e8506` (docs), `1afed92` (wire tier engine into runCommand),
    `93177e0` (Wave 1 foundation), `9c8c192` (chore: tasks.md + execution_plan.json)
- **Last merge commit**: no-ff merge of `003-tiered-escalation` into `main`
- **Status**: 269/269 tests passing, main is stable
