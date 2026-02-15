# Tasks: Ralph Loop 2026 - Multi-Agent Testing System

**Input**: Design documents from `/specs/001-ralph-loop-2026/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Tests**: Not explicitly requested in specification - focusing on implementation tasks.

## Format: `- [ ] [ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5, US6)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Initialize TypeScript project with Node.js 20+ and tsconfig.json configured for ES2022
- [x] T002 Install core dependencies: LiteLLM, XState, ChromaDB, Zod, Vitest, dotenv
- [x] T003 [P] Configure ESLint and Prettier with TypeScript rules
- [x] T004 [P] Setup Vitest configuration in vitest.config.ts
- [x] T005 Create .gitignore for node_modules/, dist/, .ralph/, .env*, coverage/
- [x] T006 Create .dockerignore for node_modules/, .git/, .ralph/, *.log*
- [x] T007 Create project directory structure per plan.md (src/agents/, src/lifecycle/, src/state-machine/, src/memory/, src/parsers/, src/llm/, src/plugins/, src/config/, src/cli/, src/utils/, tests/)
- [x] T008 [P] Create package.json scripts for build, test, lint, format
- [x] T009 [P] Setup TypeScript path aliases in tsconfig.json (@agents, @lifecycle, @memory, @parsers, @llm, @config, @utils)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Iteration Lifecycle (Ralph Loop Core)

- [x] T010 Implement fresh session lifecycle orchestrator in src/lifecycle/iteration-manager.ts
- [x] T011 Implement context usage monitor tracking 40% smart zone boundary in src/lifecycle/context-monitor.ts
- [x] T012 Implement state persister for disk writes between iterations in src/lifecycle/state-persister.ts
- [x] T013 Implement session resetter to destroy LLM context in src/lifecycle/session-resetter.ts

### LiteLLM Integration

- [x] T014 [P] Implement LiteLLM provider router in src/llm/provider-router.ts
- [x] T015 [P] Implement cost tracker for token usage per agent in src/llm/cost-tracker.ts
- [x] T016 [P] Implement fallback handler for provider failover in src/llm/fallback-handler.ts

### State Machine Foundation

- [x] T017 Define XState state machine schema in src/state-machine/ralph-machine.ts (states: librarian, artisan, critic, testing, adversarial, completion, error)
- [x] T018 [P] Implement state transition logic in src/state-machine/transitions.ts
- [x] T019 [P] Implement guard conditions for state changes in src/state-machine/guards.ts

### Configuration Management

- [x] T020 Define configuration schema with Zod in src/config/schema-validator.ts
- [x] T021 Implement config loader with auto-discovery in src/config/config-loader.ts
- [x] T022 [P] Define built-in defaults in src/config/defaults.ts (context_reset_frequency=1, librarian=gemini-2.0-pro, artisan=claude-sonnet-4.5, critic=gpt-4.1-mini, max_iterations=30, max_cost=$2.00)

### Shared Utilities

- [x] T023 [P] Implement structured logger in src/utils/logger.ts
- [x] T024 [P] Implement atomic file I/O utilities in src/utils/file-io.ts
- [x] T025 [P] Implement git working tree status utilities in src/utils/git-utils.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Multi-Agent Code Generation (Priority: P1) 🎯 MVP

**Goal**: Orchestrate Librarian (Gemini context), Artisan (Claude codegen), Critic (GPT review) to collaboratively produce working code that passes tests

**Independent Test**: Run `ralph-loop ./file.ts --models librarian=gemini,artisan=claude,critic=gpt` and verify all three agents are invoked in sequence, produce passing code, with cost tracking and iteration logs

### Agent Interfaces

- [x] T026 [US1] Create base agent interface in src/agents/base-agent.ts
- [x] T027 [US1] Create shared agent context structure in src/agents/base/agent-context.ts

### Librarian Agent (Context Provider)

- [x] T028 [P] [US1] Implement Librarian agent with Gemini integration in src/agents/librarian/librarian.agent.ts
- [x] T029 [P] [US1] Implement dependency graph parser using TypeScript compiler API in src/agents/librarian/dependency-graph.ts
- [x] T030 [P] [US1] Implement file ranker by distance from target in src/agents/librarian/file-ranker.ts

### Artisan Agent (Code Generator)

- [x] T031 [P] [US1] Implement Artisan agent with Claude integration in src/agents/artisan/artisan.agent.ts
- [x] T032 [P] [US1] Implement code writer utilities for file modifications in src/agents/artisan/code-writer.ts

### Critic Agent (Logic Reviewer)

- [x] T033 [P] [US1] Implement Critic agent with GPT integration in src/agents/critic/critic.agent.ts
- [x] T034 [P] [US1] Implement review validation checker in src/agents/critic/review-checker.ts

### State Machine Integration

- [ ] T035 [US1] Wire Librarian agent to state machine librarian state in src/state-machine/ralph-machine.ts
- [ ] T036 [US1] Wire Artisan agent to state machine artisan state in src/state-machine/ralph-machine.ts
- [ ] T037 [US1] Wire Critic agent to state machine critic state in src/state-machine/ralph-machine.ts
- [ ] T038 [US1] Integrate iteration lifecycle manager with state machine workflow in src/state-machine/ralph-machine.ts

### CLI Interface

- [x] T039 [US1] Implement main entry point ralph-loop CLI in src/cli/ralph-loop.ts
- [x] T040 [US1] Implement run command orchestrating multi-agent workflow in src/cli/commands/run.ts
- [x] T041 [P] [US1] Implement real-time progress display in src/cli/ui/progress-display.ts
- [x] T042 [P] [US1] Implement completion summary reporter in src/cli/ui/summary-reporter.ts

**Checkpoint**: At this point, Multi-Agent Code Generation should be fully functional - Librarian → Artisan → Critic workflow executes with fresh context each iteration

---

## Phase 4: User Story 4 - Polyglot Testing Support (Priority: P1)

**Goal**: Auto-detect TypeScript/JavaScript/Python/Rust projects, use native test frameworks (Jest/Vitest/pytest/cargo test), parse unified ralph-test-json format

**Independent Test**: Run `ralph-loop ./file.py` on Python project and verify pytest is auto-detected, tests execute, results are parsed to ralph-test-json schema, coverage data included

### Test Framework Detection

- [x] T043 [P] [US4] Implement framework detector scanning manifest files in src/parsers/framework-detector.ts

### Language-Specific Parsers

- [x] T044 [P] [US4] Define base parser interface with ralph-test-json schema in src/parsers/base-parser.ts
- [x] T045 [P] [US4] Implement Jest/Vitest parser for TypeScript/JavaScript in src/parsers/jest-parser.ts
- [x] T046 [P] [US4] Implement pytest parser for Python in src/parsers/pytest-parser.ts
- [x] T047 [P] [US4] Implement cargo test parser for Rust in src/parsers/cargo-parser.ts

### Test Execution Integration

- [ ] T048 [US4] Integrate framework detector with state machine testing state in src/state-machine/ralph-machine.ts
- [ ] T049 [US4] Wire test parsers to generate unified ralph-test-json output in src/state-machine/transitions.ts
- [ ] T050 [US4] Persist test results to .ralph/session-{id}/test-results-iteration-{N}.json in src/lifecycle/state-persister.ts

### Dependency Graph for Multiple Languages

- [ ] T051 [P] [US4] Implement Python import parser using AST in src/agents/librarian/dependency-graph.ts
- [ ] T052 [P] [US4] Implement Rust module parser using tree-sitter in src/agents/librarian/dependency-graph.ts

**Checkpoint**: Polyglot support working - TypeScript, JavaScript, Python, Rust projects all detect correct framework, run native tests, produce unified ralph-test-json format

---

## Phase 5: User Story 6 - Completion Promise Pattern (Priority: P1)

**Goal**: Enforce success criteria (tests pass, adversarial tests pass, coverage threshold) and budget constraints (max cost, max iterations, max duration), exit with appropriate status

**Independent Test**: Configure ralph.config.yaml with strict budget ($0.50 max cost), run on complex problem, verify system stops exactly when budget exceeded with status "budget_exceeded" and detailed cost breakdown

### Success Criteria Evaluation

- [ ] T053 [US6] Implement success criteria evaluator in src/state-machine/guards.ts (tests_pass, adversarial_tests_pass, coverage_threshold, mutation_score_min)
- [ ] T054 [US6] Implement budget constraint enforcer in src/lifecycle/iteration-manager.ts (max_cost_usd, max_iterations, max_duration_minutes)

### Exit Status Handling

- [ ] T055 [US6] Implement completion status logic in src/state-machine/ralph-machine.ts (success, budget_exceeded, entropy_detected, max_iterations)
- [ ] T056 [US6] Add detailed completion report to summary reporter in src/cli/ui/summary-reporter.ts (iterations, cost breakdown by agent, patterns learned, next steps)

### Entropy Detection

- [ ] T057 [US6] Implement entropy detector for circuit breaker in src/lifecycle/iteration-manager.ts (track 3 identical unit test errors, pause and ask user)
- [ ] T058 [US6] Add entropy threshold configuration to defaults in src/config/defaults.ts

**Checkpoint**: Completion promise working - system exits correctly on success, budget exceeded, entropy detected, or max iterations with detailed reports

---

## Phase 6: User Story 2 - Intelligent Error Learning (Priority: P2)

**Goal**: MemoryVault queries similar past errors (similarity >= 0.85), retrieves top 5 fixes ranked by success rate, records new successful fixes for future learning

**Independent Test**: Introduce common error pattern (e.g., null pointer), verify system queries MemoryVault for similar errors, applies top-ranked fix, resolves faster than baseline without MemoryVault

### MemoryVault Core

- [x] T059 [P] [US2] Implement ChromaDB wrapper for MemoryVault in src/memory/memory-vault.ts
- [x] T060 [P] [US2] Implement error categorizer (SYNTAX/LOGIC/ENVIRONMENT/FLAKY/PERFORMANCE) in src/memory/error-categorizer.ts
- [x] T061 [P] [US2] Implement fix recorder for successful attempts in src/memory/fix-recorder.ts
- [X] T062 [P] [US2] Implement similarity search for top 5 past fixes in src/memory/similarity-search.ts

### Agent Integration

- [ ] T063 [US2] Integrate MemoryVault query in Artisan agent before code generation in src/agents/artisan/artisan.agent.ts
- [ ] T064 [US2] Integrate fix recording in state machine completion state after success in src/state-machine/ralph-machine.ts

### Entropy Detection Integration

- [ ] T065 [US2] Wire entropy detector to MemoryVault for tracking identical errors in src/lifecycle/iteration-manager.ts
- [ ] T066 [US2] Ensure adversarial test failures do NOT increment entropy counter (only unit test failures) in src/memory/error-categorizer.ts

**Checkpoint**: MemoryVault operational - past errors are queried with <100ms latency, top 5 fixes applied, new successful fixes recorded to project-specific .ralph/memory.db

---

## Phase 7: User Story 3 - Adversarial Testing Discovery (Priority: P2)

**Goal**: Chaos Agent runs AFTER unit tests pass, generates property-based tests, mutation tests, boundary value tests, race condition tests to discover edge cases

**Independent Test**: Generate code that passes unit tests, run adversarial testing phase, verify Chaos Agent discovers at least 2 edge cases (e.g., null byte injection, max integer overflow) not covered by original tests

### Chaos Agent Implementation

- [X] T067 [P] [US3] Implement Chaos Agent orchestrator in src/agents/chaos/chaos.agent.ts
- [X] T068 [P] [US3] Implement property-based test generator using fast-check in src/agents/chaos/property-tests.ts
- [X] T069 [P] [US3] Implement mutation testing integration with Stryker in src/agents/chaos/mutation-testing.ts
- [X] T070 [P] [US3] Implement boundary value fuzzer in src/agents/chaos/boundary-values.ts

### State Machine Integration

- [X] T071 [US3] Add adversarial testing state to state machine after testing state in src/state-machine/ralph-machine.ts
- [X] T072 [US3] Wire Chaos Agent to adversarial state with guard condition (only if unit tests pass) in src/state-machine/ralph-machine.ts

### Backtracking Logic

- [X] T073 [US3] Implement intelligent backtracking for adversarial failures in src/state-machine/transitions.ts (revert to last known good state, try alternative fix)
- [X] T074 [US3] Ensure adversarial failures do NOT count toward entropy threshold in src/memory/error-categorizer.ts

### Configuration

- [X] T075 [US3] Add adversarial testing config options to defaults in src/config/defaults.ts (adversarial_tests: true, mutation_score_min: 80%)

**Checkpoint**: Adversarial testing working - Chaos Agent runs after unit tests pass, discovers edge cases with property-based/mutation/boundary tests, backtracking applies alternative fixes

---

## Phase 8: User Story 5 - Plugin Extensibility (Priority: P3)

**Goal**: Load plugins from ralph-plugins.yaml, execute hooks (onBeforeGen, onAfterGen, onTestFail, onSuccess, onBeforeSuccess) at lifecycle stages, handle failures gracefully

**Independent Test**: Install sample plugin (@builder.io/micro-agent-plugin-prettier), configure to run onAfterGen hook, generate code, verify plugin executes and formats code without blocking main workflow

### Plugin SDK

- [X] T076 [P] [US5] Define TypeScript plugin interface in src/plugins/sdk/plugin.interface.ts (RalphPlugin, hooks, context types)
- [X] T077 [P] [US5] Create plugin SDK type definitions in specs/001-ralph-loop-2026/contracts/plugin-sdk.d.ts

### Plugin Manager

- [X] T078 [US5] Implement plugin loader from ralph-plugins.yaml in src/plugins/plugin-loader.ts
- [X] T079 [US5] Implement hook executor with timeout and error handling in src/plugins/hook-executor.ts

### State Machine Integration

- [X] T080 [US5] Wire plugin hooks to state machine lifecycle stages in src/state-machine/ralph-machine.ts (onBeforeGen before artisan, onAfterGen after artisan, onTestFail after testing failure, onSuccess/onBeforeSuccess before completion)
- [X] T081 [US5] Ensure plugin failures are logged but do NOT crash main workflow in src/plugins/hook-executor.ts

### Configuration

- [X] T082 [US5] Add plugins section to config schema in src/config/schema-validator.ts
- [X] T083 [US5] Document plugin discovery and loading in specs/001-ralph-loop-2026/quickstart.md

**Checkpoint**: Plugin system operational - plugins load from config, hooks execute at correct lifecycle stages, failures are gracefully handled without blocking core workflow

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

### Documentation

- [ ] T084 [P] Create README.md with installation, usage, configuration guide
- [ ] T085 [P] Generate API documentation from TypeScript interfaces using TypeDoc
- [ ] T086 [P] Document all 6 user stories with examples in specs/001-ralph-loop-2026/quickstart.md

### Testing & Validation

- [ ] T087 [P] Create unit tests for iteration lifecycle in tests/unit/lifecycle/
- [ ] T088 [P] Create unit tests for MemoryVault operations in tests/unit/memory/
- [ ] T089 [P] Create unit tests for test result parsers in tests/unit/parsers/
- [ ] T090 [P] Create integration test for full state machine workflow in tests/integration/state-machine.test.ts
- [ ] T091 [P] Create integration test for multi-agent coordination in tests/integration/multi-agent.test.ts
- [ ] T092 [P] Create e2e test on TypeScript project in tests/e2e/typescript-project.test.ts
- [ ] T093 [P] Create e2e test on Python project in tests/e2e/python-project.test.ts
- [ ] T094 [P] Create e2e test verifying fresh context each iteration in tests/e2e/context-freshness.test.ts

### Performance & Security

- [ ] T095 Code cleanup and refactoring across all modules
- [ ] T096 Performance optimization for dependency graph caching
- [ ] T097 Security hardening for sandboxed plugin execution
- [ ] T098 Add input validation for all CLI arguments and config files

### Final Validation

- [ ] T099 Run quickstart.md scenarios to validate all user stories work end-to-end
- [ ] T100 Verify coverage threshold meets 95% per SC-011
- [ ] T101 Validate context usage stays below 40% per SC-016

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-8)**: All depend on Foundational phase completion
  - Phase 3 (US1 - Multi-Agent): Can start immediately after Foundational ✅
  - Phase 4 (US4 - Polyglot): Can start immediately after Foundational ✅
  - Phase 5 (US6 - Completion Promise): Can start immediately after Foundational ✅
  - Phase 6 (US2 - Error Learning): Can start after Foundational, enhanced by US1 agents
  - Phase 7 (US3 - Adversarial Testing): Can start after Foundational, enhanced by US4 test parsers
  - Phase 8 (US5 - Plugin System): Can start after Foundational ✅
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1 - Multi-Agent)**: Foundation only - independently testable
- **User Story 4 (P1 - Polyglot)**: Foundation only - independently testable
- **User Story 6 (P1 - Completion Promise)**: Foundation only - independently testable
- **User Story 2 (P2 - Error Learning)**: Benefits from US1 agents but independently testable
- **User Story 3 (P2 - Adversarial Testing)**: Benefits from US4 test parsers but independently testable
- **User Story 5 (P3 - Plugin System)**: Foundation only - independently testable

### Within Each User Story

- Agent interfaces before implementations
- Parsers before integrations
- State machine wiring after agent implementations
- Tests (if written) before implementations

### Parallel Opportunities

- **Setup (Phase 1)**: T003, T004, T008, T009 can run in parallel
- **Foundational (Phase 2)**: T014-T016, T018-T019, T023-T025 can run in parallel within their groups
- **User Story 1**: T028-T030 (Librarian), T031-T032 (Artisan), T033-T034 (Critic), T041-T042 (UI) can all run in parallel
- **User Story 4**: T044-T047 (all parsers), T051-T052 (language parsers) can run in parallel
- **User Story 2**: T059-T062 (MemoryVault components) can run in parallel
- **User Story 3**: T067-T070 (Chaos Agent components) can run in parallel
- **User Story 5**: T076-T077 can run in parallel
- **Polish**: T084-T086 (docs), T087-T094 (tests) can all run in parallel

---

## Parallel Example: User Story 1 (Multi-Agent)

```bash
# After Foundational phase completes, launch all agent implementations in parallel:

# Librarian components (parallel):
Task: "Implement Librarian agent in src/agents/librarian/librarian.agent.ts"
Task: "Implement dependency graph parser in src/agents/librarian/dependency-graph.ts"
Task: "Implement file ranker in src/agents/librarian/file-ranker.ts"

# Artisan components (parallel):
Task: "Implement Artisan agent in src/agents/artisan/artisan.agent.ts"
Task: "Implement code writer utilities in src/agents/artisan/code-writer.ts"

# Critic components (parallel):
Task: "Implement Critic agent in src/agents/critic/critic.agent.ts"
Task: "Implement review validator in src/agents/critic/review-checker.ts"

# UI components (parallel):
Task: "Implement progress display in src/cli/ui/progress-display.ts"
Task: "Implement summary reporter in src/cli/ui/summary-reporter.ts"

# Then wire to state machine sequentially (T035-T038)
```

---

## Implementation Strategy

### MVP First (P1 User Stories: 1, 4, 6)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Multi-Agent Code Generation)
4. **VALIDATE**: Test multi-agent workflow independently
5. Complete Phase 4: User Story 4 (Polyglot Testing Support)
6. **VALIDATE**: Test TypeScript, Python, Rust projects independently
7. Complete Phase 5: User Story 6 (Completion Promise Pattern)
8. **VALIDATE**: Test budget enforcement and exit conditions
9. **STOP and DEMO**: MVP ready with core Ralph Loop 2026 functionality

### Incremental Delivery (Add P2 Features)

10. Complete Phase 6: User Story 2 (Intelligent Error Learning)
11. **VALIDATE**: Test MemoryVault query and recording independently
12. Complete Phase 7: User Story 3 (Adversarial Testing Discovery)
13. **VALIDATE**: Test Chaos Agent edge case discovery independently
14. **DEPLOY/DEMO**: Enhanced version with error learning and adversarial testing

### Full Feature Set (Add P3 Features)

15. Complete Phase 8: User Story 5 (Plugin Extensibility)
16. **VALIDATE**: Test plugin loading and hook execution independently
17. Complete Phase 9: Polish & Cross-Cutting Concerns
18. **FINAL VALIDATION**: Run all quickstart.md scenarios
19. **PRODUCTION READY**: Ralph Loop 2026 complete

### Parallel Team Strategy

With multiple developers:

1. **Team completes Setup + Foundational together** (Phases 1-2)
2. **Once Foundational done, split into parallel tracks**:
   - Developer A: User Story 1 (Multi-Agent)
   - Developer B: User Story 4 (Polyglot)
   - Developer C: User Story 6 (Completion Promise)
3. **P1 stories complete, split into P2 tracks**:
   - Developer A: User Story 2 (Error Learning)
   - Developer B: User Story 3 (Adversarial Testing)
4. **P2 stories complete**:
   - Developer A: User Story 5 (Plugin System)
   - Team: Polish (parallel test writing)

---

## Summary

**Total Tasks**: 101
**User Story Task Breakdown**:
- US1 (Multi-Agent Code Generation): 17 tasks (T026-T042)
- US4 (Polyglot Testing Support): 10 tasks (T043-T052)
- US6 (Completion Promise Pattern): 6 tasks (T053-T058)
- US2 (Intelligent Error Learning): 8 tasks (T059-T066)
- US3 (Adversarial Testing Discovery): 9 tasks (T067-T075)
- US5 (Plugin Extensibility): 8 tasks (T076-T083)
- Setup: 9 tasks (T001-T009)
- Foundational: 16 tasks (T010-T025)
- Polish: 18 tasks (T084-T101)

**Parallel Opportunities**: 42 tasks marked [P] can run simultaneously within their phases

**Independent Test Criteria**:
- US1: Multi-agent workflow executes Librarian → Artisan → Critic with fresh context
- US4: TypeScript/Python/Rust projects auto-detect frameworks, produce ralph-test-json
- US6: Budget constraints enforced, system exits with correct status codes
- US2: MemoryVault queries return top 5 fixes in <100ms, new fixes recorded
- US3: Chaos Agent discovers edge cases after unit tests pass, backtracking works
- US5: Plugins load, hooks execute, failures don't block main workflow

**MVP Scope**: User Stories 1, 4, 6 (Phases 1-5) = 48 tasks for minimum viable Ralph Loop 2026

---

## Notes

- Fresh context each iteration (context_reset_frequency=1) is GOLD STANDARD default per FR-009
- Context usage monitored, automatic reset at 40% per FR-014
- Disk is the memory (git + test results + MemoryVault), not conversation history per FR-015
- Adversarial test failures do NOT count toward entropy threshold per FR-019
- All tasks follow format: `- [ ] [TaskID] [P?] [Story?] Description with file path`
- Verify each user story independently at checkpoints before proceeding
- Commit after each logical task group or phase completion
- Avoid blocking dependencies between user stories to maintain independence
