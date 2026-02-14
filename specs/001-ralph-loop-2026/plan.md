# Implementation Plan: Ralph Loop 2026 - Multi-Agent Testing System

**Branch**: `001-ralph-loop-2026` | **Date**: 2026-02-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ralph-loop-2026/spec.md`

## Summary

Transform the micro-agent iterative testing loop into Ralph Loop 2026, a sophisticated multi-agent system that maintains **fresh LLM context each iteration** (true Ralph methodology) while orchestrating specialized AI agents (Librarian for context analysis, Artisan for code generation, Critic for logic review, Chaos for adversarial testing). The system executes stateless iterations that read from disk (git working tree + test results + MemoryVault), perform multi-agent workflows, write changes to disk, then exit completely to prevent context bloat. Supports TypeScript/JavaScript/Python/Rust with native test framework detection, intelligent error learning via vector database, completion promise pattern with budget constraints, and optional plugin extensibility.

**Key Innovation**: Each iteration starts with fresh LLM sessions (context_reset_frequency=1 default) to stay within the "smart zone" (<40% context usage), avoiding the quality degradation that plagued Anthropic's continuous-session Ralph plugin. The codebase IS the memory, not the conversation.

## Technical Context

**Language/Version**: TypeScript 5.0+ / Node.js 20+
**Primary Dependencies**:
- **LiteLLM** (unified LLM provider interface for Claude, Gemini, GPT, Ollama, Azure OpenAI)
- **XState** (state machine orchestration for multi-agent workflow)
- **ChromaDB or LanceDB** (vector database for MemoryVault fix pattern storage)
- **Zod** (runtime schema validation for ralph-test-json and configs)
- **Vitest** (testing framework for Ralph Loop codebase itself)
- **Language-specific parsers**: TypeScript compiler API (dependency graph), Python AST (import analysis), tree-sitter (Rust parsing)

**Storage**:
- **Project-specific**: `.ralph/memory.db` (vector embeddings + fix attempts), `.ralph/session-{id}/` (iteration logs, test results)
- **Optional global**: Cloud-synced anonymized pattern database (opt-in)
- **Disk-based state**: Git working tree, test output JSON files

**Testing**:
- **Ralph Loop codebase**: Vitest + fast-check (property-based testing), Stryker (mutation testing), c8 (coverage)
- **Target project detection**: Auto-detect jest/vitest/mocha (TS/JS), pytest/unittest (Python), cargo test (Rust)
- **Test execution**: Sandboxed via Docker or WebContainers (isolate malicious code)

**Target Platform**: Linux/macOS/Windows CLI tool (cross-platform via Node.js)

**Project Type**: Single project (CLI application with modular architecture)

**Performance Goals**:
- **Iteration latency**: <10s per iteration excluding test execution time (LLM API calls parallelized where possible)
- **Context usage**: <40% per agent per iteration (smart zone operation)
- **MemoryVault query**: <100ms similarity search for top 5 past fixes
- **Cost efficiency**: 30% reduction vs baseline through intelligent caching and error learning
- **Success rate**: 95% test pass rate within max 30 iterations and $2.00 budget

**Constraints**:
- **Stateless iterations**: Each iteration MUST start fresh LLM session (destroy prior context) - gold standard
- **Max iterations**: Hard limit 30 to prevent infinite loops
- **Budget limits**: max_cost_usd (default $2.00), max_duration_minutes (default 15)
- **Sandbox timeout**: 300 seconds per test execution
- **File size**: Code files >10k lines trigger warning (Librarian context window risk)
- **Language support (MVP)**: TypeScript, JavaScript, Python, Rust only
- **Context reset override**: Automatic reset at 40% usage even if user configured context_reset_frequency>1

**Scale/Scope**:
- **Codebase size**: Projects up to 1M tokens codebase with intelligent dependency graph pruning
- **MemoryVault capacity**: 1000 fix patterns (pruned FIFO when exceeded)
- **Concurrent instances**: Multiple ralph-loop sessions per project via unique session IDs
- **Iteration tracking**: Detailed logs per iteration in .ralph/session-{id}/iterations.log

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**No project constitution found** - proceeding with default quality gates:

### Default Quality Gates

✅ **Simplicity**: CLI tool with modular architecture (agents, parsers, state machine) - no unnecessary abstraction layers
✅ **Testability**: Each component (agent interface, test parsers, MemoryVault, state machine) independently testable
✅ **Maintainability**: Clear separation of concerns (agents, lifecycle, storage, parsing) with dependency injection
✅ **Performance**: Stateless iterations prevent context bloat, vector DB indexing for fast fix retrieval
✅ **Security**: Sandboxed test execution (Docker/WebContainers), PII masking optional via Local Guard agent

### Feature-Specific Quality Considerations

⚠️ **Complexity justified for:**
- **Multi-agent orchestration**: Specialized agents (Librarian/Artisan/Critic/Chaos) improve quality over single model
- **Vector database integration**: MemoryVault learning reduces iterations by 30% (proven value)
- **Polyglot support**: Native framework detection (jest/pytest/cargo) required for target languages
- **Plugin system**: Extensibility for community contributions (post-MVP enhancement)

**Decision**: Complexity acceptable given 95% success rate target and 30% cost reduction goals

## Project Structure

### Documentation (this feature)

```text
specs/001-ralph-loop-2026/
├── spec.md              # Feature specification (requirements, success criteria)
├── plan.md              # This file (technical architecture, research findings)
├── research.md          # Phase 0: Technology evaluation and best practices
├── data-model.md        # Phase 1: Core entities and relationships
├── quickstart.md        # Phase 1: Usage examples and integration scenarios
├── contracts/           # Phase 1: API contracts and schemas
│   ├── ralph-test-json.schema.json    # Unified test result format
│   ├── ralph-config.schema.json       # Configuration file schema
│   └── plugin-sdk.d.ts                # TypeScript plugin interfaces
└── tasks.md             # Phase 2: Implementation task breakdown (NOT created yet)
```

### Source Code (repository root)

**Structure Decision**: Single project CLI tool with modular architecture. The micro-agent repository will be extended with new components while maintaining backward compatibility with existing `micro-agent` CLI.

```text
src/
├── agents/                     # Multi-agent system
│   ├── base/
│   │   ├── agent.interface.ts         # Base agent contract
│   │   └── agent-context.ts           # Shared context structure
│   ├── librarian/
│   │   ├── librarian.agent.ts         # Context provider (Gemini)
│   │   ├── dependency-graph.ts        # Import/require analysis
│   │   └── file-ranker.ts             # Distance-based prioritization
│   ├── artisan/
│   │   ├── artisan.agent.ts           # Code generator (Claude)
│   │   └── code-writer.ts             # File modification utilities
│   ├── critic/
│   │   ├── critic.agent.ts            # Logic reviewer (GPT)
│   │   └── review-checker.ts          # Review validation
│   ├── chaos/
│   │   ├── chaos.agent.ts             # Adversarial tester
│   │   ├── property-tests.ts          # fast-check/Hypothesis generators
│   │   ├── mutation-testing.ts        # Stryker/mutmut integration
│   │   └── boundary-values.ts         # Edge input fuzzing
│   └── local-guard/
│       ├── local-guard.agent.ts       # Optional privacy/sanity (Ollama)
│       └── pii-masker.ts              # Sensitive data detection
│
├── lifecycle/                  # Iteration management (CORE RALPH LOOP)
│   ├── iteration-manager.ts           # Fresh session lifecycle orchestrator
│   ├── context-monitor.ts             # Track 40% smart zone boundary
│   ├── state-persister.ts             # Write to disk between iterations
│   └── session-resetter.ts            # Destroy LLM context, start fresh
│
├── state-machine/              # XState workflow orchestration
│   ├── ralph-machine.ts               # State machine definition
│   ├── transitions.ts                 # Phase transition logic
│   └── guards.ts                      # Condition checks for state changes
│
├── memory/                     # MemoryVault vector database
│   ├── memory-vault.ts                # ChromaDB/LanceDB wrapper
│   ├── error-categorizer.ts           # SYNTAX/LOGIC/ENVIRONMENT/FLAKY/PERFORMANCE
│   ├── fix-recorder.ts                # Store successful attempts
│   └── similarity-search.ts           # Query top 5 past fixes
│
├── parsers/                    # Language-specific test result parsing
│   ├── base-parser.ts                 # ralph-test-json schema
│   ├── jest-parser.ts                 # TypeScript/JavaScript (Jest/Vitest)
│   ├── pytest-parser.ts               # Python (pytest/unittest)
│   ├── cargo-parser.ts                # Rust (cargo test)
│   └── framework-detector.ts          # Auto-detect via manifest files
│
├── llm/                        # LiteLLM provider abstraction
│   ├── provider-router.ts             # Route to Claude/Gemini/GPT/Ollama
│   ├── cost-tracker.ts                # Token usage and cost per agent
│   └── fallback-handler.ts            # Provider failover (Gemini → Claude → GPT)
│
├── plugins/                    # Plugin system (Phase 6 / post-MVP)
│   ├── plugin-loader.ts               # Load from ralph-plugins.yaml
│   ├── hook-executor.ts               # onBeforeGen, onAfterGen, onTestFail, onSuccess
│   └── sdk/
│       └── plugin.interface.ts        # RalphPlugin TypeScript types
│
├── config/                     # Configuration management
│   ├── config-loader.ts               # Auto-discover + defaults
│   ├── schema-validator.ts            # Zod validation
│   └── defaults.ts                    # Built-in defaults (context_reset_frequency=1)
│
├── cli/                        # Command-line interface
│   ├── ralph-loop.ts                  # Main entry point
│   ├── commands/
│   │   └── run.ts                     # Execute Ralph loop
│   └── ui/
│       ├── progress-display.ts        # Real-time iteration updates
│       └── summary-reporter.ts        # Completion report
│
└── utils/                      # Shared utilities
    ├── logger.ts                      # Structured logging
    ├── file-io.ts                     # Atomic writes, disk reads
    └── git-utils.ts                   # Working tree status

tests/
├── unit/                       # Component-level tests
│   ├── agents/                        # Test each agent in isolation
│   ├── lifecycle/                     # Iteration lifecycle tests
│   ├── memory/                        # MemoryVault CRUD operations
│   └── parsers/                       # Test result parsing validation
│
├── integration/                # Multi-component tests
│   ├── state-machine.test.ts          # Full workflow orchestration
│   ├── multi-agent.test.ts            # Agent coordination
│   └── disk-persistence.test.ts       # State save/load between iterations
│
└── e2e/                        # End-to-end scenarios
    ├── typescript-project.test.ts     # Full Ralph loop on TS codebase
    ├── python-project.test.ts         # Full Ralph loop on Python codebase
    └── context-freshness.test.ts      # Verify fresh session each iteration

.ralph/                         # Project-local Ralph state (gitignored)
├── memory.db                           # Project-specific MemoryVault
└── session-{uuid}/                     # Per-instance isolation
    ├── iterations.log                  # Iteration-by-iteration log
    ├── test-results-iteration-{N}.json # Test output per iteration
    └── checkpoints/                    # Backtracking state snapshots

config/
└── ralph.config.yaml           # User configuration (optional, auto-discovered)
```

## Complexity Tracking

> **No complexity violations requiring justification.**

The architecture follows single-project CLI pattern with clear modular boundaries. Multi-agent complexity is justified by measurable success criteria (95% test pass rate, 30% cost reduction). Vector database integration provides learning capability that reduces iterations. Stateless iteration lifecycle prevents context bloat and ensures consistent quality.

---

# Phase 0: Research

## Research Questions

Based on Technical Context, the following areas require technology evaluation and best practice research:

### R1: LiteLLM Integration for Multi-Provider Support
**Question**: How to implement unified LLM interface that supports Claude (Anthropic), Gemini (Google), GPT (OpenAI), Ollama (local), and Azure OpenAI with consistent error handling, cost tracking, and provider fallback?

**Research needed**:
- LiteLLM API patterns for model routing
- Cost tracking implementation per provider
- Fallback strategies (Gemini → Claude → GPT when one fails)
- Authentication management for multiple API keys

### R2: Vector Database Selection (ChromaDB vs LanceDB)
**Question**: Which vector database provides best performance for MemoryVault use case (1000 fix patterns, <100ms similarity search, concurrent access from multiple ralph-loop instances)?

**Research needed**:
- ChromaDB vs LanceDB feature comparison
- Embedding model selection for error signatures
- Concurrency handling (atomic writes, row-level locking)
- Deployment simplicity (SQLite-based vs server-based)

### R3: Stateless Iteration Implementation with XState
**Question**: How to implement XState state machine that executes complete workflow (Librarian → Artisan → Critic → test → completion) within single iteration, then resets all context before next iteration?

**Research needed**:
- XState session lifecycle patterns
- Context destruction between machine invocations
- State persistence to disk between iterations
- Integration with LiteLLM providers (fresh sessions)

### R4: Dependency Graph Analysis for Context Prioritization
**Question**: How to parse import/require statements across TypeScript/JavaScript/Python/Rust to build dependency graph and rank files by distance from target file?

**Research needed**:
- TypeScript compiler API for import analysis
- Python AST parsing for import/require detection
- Tree-sitter for Rust module parsing
- Graph algorithms for shortest path distance calculation

### R5: Test Framework Detection and Result Parsing
**Question**: How to auto-detect test frameworks (jest/vitest/mocha for TS/JS, pytest/unittest for Python, cargo test for Rust) and parse their output into unified ralph-test-json schema?

**Research needed**:
- Manifest file patterns (package.json, pyproject.toml, Cargo.toml)
- Test runner output formats and parsers
- Coverage data extraction (c8 for TS/JS, coverage.py for Python, cargo-tarpaulin for Rust)
- Error message normalization across frameworks

### R6: Sandboxed Test Execution (Docker vs WebContainers)
**Question**: Docker or WebContainers for isolated test execution to prevent malicious code from affecting host system?

**Research needed**:
- Docker container lifecycle (start, run test, collect output, destroy)
- WebContainers for in-browser sandboxing (security limitations)
- Performance comparison (overhead, startup time)
- Volume mounting for code files and test results

### R7: Context Usage Monitoring (40% Smart Zone Boundary)
**Question**: How to track cumulative token usage per agent per iteration and trigger automatic context reset when approaching 40% of context window?

**Research needed**:
- LiteLLM token counting APIs
- Provider-specific context window limits (Claude 200k, Gemini 1M, GPT 128k)
- Token estimation for code files and test output
- Real-time monitoring and warning thresholds

### R8: Plugin System Architecture (Phase 6 / Post-MVP)
**Question**: How to design hook-based plugin system that allows community extensions (onBeforeGen, onAfterGen, onTestFail, onSuccess) without blocking core workflow?

**Research needed**:
- TypeScript plugin interface patterns
- Sandboxed plugin execution (file system restrictions, network whitelisting)
- Hook lifecycle integration with state machine
- Plugin discovery from ralph-plugins.yaml

---

# Phase 1: Design

## Phase 1.1: Data Model

*Prerequisites: Phase 0 research complete, technology choices finalized*

**Output**: `data-model.md` with entity definitions, relationships, validation rules

Key entities to design (extracted from FR-001 through FR-050):
- **Agent** (Librarian, Artisan, Critic, Chaos, LocalGuard)
- **Session** (unique ID, iteration logs, state directory)
- **Iteration** (fresh context lifecycle, disk persistence)
- **TestResult** (ralph-test-json schema)
- **ErrorPattern** (categorized signatures, fix attempts)
- **FixAttempt** (hypothesis, action, success, tokens)
- **Plugin** (hooks, config, enabled flag)
- **CompletionPromise** (success criteria, budget constraints)
- **DependencyGraph** (nodes, edges, distance matrix)
- **LanguageConfig** (framework detection, test commands)

## Phase 1.2: API Contracts

*Prerequisites: Data model complete*

**Output**: `contracts/` directory with schemas and interfaces

Files to generate:
1. **ralph-test-json.schema.json**: Unified test result format (OpenAPI/JSON Schema)
2. **ralph-config.schema.json**: Configuration file validation schema
3. **plugin-sdk.d.ts**: TypeScript plugin interface definitions
4. **agent-context.d.ts**: Shared context structure for multi-agent communication
5. **memory-vault.d.ts**: MemoryVault query/store interfaces

## Phase 1.3: Integration Scenarios

*Prerequisites: Contracts defined*

**Output**: `quickstart.md` with usage examples

Scenarios to document:
1. **Zero-config usage**: `ralph-loop ./file.ts` (auto-discover test framework, use defaults)
2. **Custom configuration**: `ralph-loop ./file.py --config custom-ralph.yaml`
3. **Multi-agent override**: `ralph-loop ./file.rs --models artisan=claude,critic=gemini`
4. **Budget constraints**: `ralph-loop ./file.ts --budget 1.00 --max-iterations 20`
5. **Context reset tuning**: `context_reset_frequency=5` in config (with warnings)
6. **Concurrent instances**: Multiple `ralph-loop` sessions with unique session IDs
7. **MemoryVault global sharing**: Opt-in via `memory.global_sharing: true` in config

## Phase 1.4: Agent Context Update

*Prerequisites: Technology choices finalized from Phase 0*

**Action**: Run `.specify/scripts/bash/update-agent-context.sh claude` to update Claude Code context with new technologies:
- LiteLLM (unified LLM provider)
- XState (state machine)
- ChromaDB or LanceDB (vector database)
- Vitest + fast-check + Stryker (testing stack)
- Tree-sitter (multi-language parsing)

---

# Next Steps

After `/speckit.plan` completes (Phase 0 + Phase 1):

1. **Review generated artifacts**:
   - `research.md` - Verify technology choices resolve all NEEDS CLARIFICATION
   - `data-model.md` - Validate entity relationships align with spec FRs
   - `contracts/` - Check schemas match ralph-test-json and config requirements
   - `quickstart.md` - Ensure usage scenarios cover primary workflows

2. **Run `/speckit.tasks`**:
   - Generate detailed task breakdown (tasks.md) from plan
   - Organize by phases: Setup, Tests, Core, Integration, Polish
   - Identify parallel vs sequential tasks (dependency analysis)

3. **Execute `/speckit.implement`**:
   - TDD approach (write tests first)
   - Implement core iteration lifecycle (fresh context per iteration)
   - Build multi-agent orchestration with XState
   - Integrate MemoryVault for error learning
   - Add polyglot test framework support

**Critical Success Factors**:
- ✅ Fresh LLM context each iteration (context_reset_frequency=1 default)
- ✅ Context usage monitoring (<40% smart zone operation)
- ✅ Disk-based state persistence (git + test results + MemoryVault)
- ✅ Stateless agent workflow (Librarian → Artisan → Critic → test → exit)
- ✅ Budget enforcement (max_cost_usd, max_iterations, max_duration_minutes)
