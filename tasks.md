# Tasks: Simple Mode with Auto-Escalation

**Branch**: `002-simple-escalation`
**Input**: Design documents from `/specs/002-simple-escalation/`
**Total Tasks**: 28
**Test tasks**: Included (integration and unit coverage for escalation logic)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete sibling tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new types and foundational data structures that all waves depend on.

- [x] T001 Add `SimpleIterationRecord` and `FailureSummary` interfaces to `src/lifecycle/types.ts`
- [x] T002 Add `EscalationEvent` interface to `src/lifecycle/types.ts`
- [x] T003 Add `escalationContext?: string` field to `AgentContext` interface in `src/agents/base/agent-context.ts`
- [x] T004 Add `withEscalationContext(context, summary)` immutable update function to `src/agents/base/agent-context.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core logic that ALL user stories depend on — simple iteration runner and failure summary builder.

- [x] T005 Extract `runSimpleIteration()` function in `src/cli/commands/run.ts` — Artisan (phase 2) + Tests (phase 4) only, no Librarian or Critic
- [x] T006 Implement `buildFailureSummary(records: SimpleIterationRecord[]): FailureSummary` in `src/cli/commands/run.ts` — generates `naturalLanguageSummary` text block from accumulated records, deduplicated error signatures, capped at 500 tokens
- [x] T007 [P] Add `simpleIterations`, `noEscalate`, `fullMode` fields to `RunOptions` interface in `src/cli/commands/run.ts`
- [x] T008 [P] Register `--simple [N]`, `--no-escalate`, `--full` CLI flags with commander in `src/cli/ralph-loop.ts`

---

## Phase 3: User Story 1 — Simple Mode Solves the Problem

**Story Goal**: `ma-loop run src/file.ts` runs in simple mode by default (N=5), exits on first success, reports cost and iteration count.

**Independent Test Criteria**: Run `ma-loop run src/math.ts --simple 3 --no-escalate` against a file with a known simple bug. Confirm it passes within 3 iterations without invoking Librarian or Critic agents.

- [x] T009 [US1] Add simple mode sub-loop in `runCommand()` in `src/cli/commands/run.ts` — runs `runSimpleIteration()` for up to N iterations, accumulates `SimpleIterationRecord[]`, exits on success
- [x] T010 [US1] Wire default behaviour in `runCommand()`: when neither `--simple` nor `--full` is passed, default to `--simple 5`
- [x] T011 [US1] Wire budget check inside simple mode loop — call `isBudgetExceeded(context)` each iteration; if true, exit loop cleanly with budget-failure message
- [x] T012 [P] [US1] Update final report section in `runCommand()` for simple-only success output — show mode used, iterations, per-phase cost breakdown per `contracts/cli-interface.md`
- [x] T013 [P] [US1] Write unit tests for `buildFailureSummary()` in `tests/unit/lifecycle/simple-escalation.test.ts` — verify all error messages captured, summary capped at 500 tokens, deduplication works
- [x] T014 [P] [US1] Write unit tests for `withEscalationContext()` in `tests/unit/lifecycle/simple-escalation.test.ts` — verify immutability (original context unchanged), field set correctly
- [x] T015 [US1] Write integration test: simple mode success path in `tests/integration/escalation-flow.test.ts` — mock Artisan to succeed on iteration 2, confirm Librarian and Critic never called, confirm early exit

---

## Phase 4: User Story 2 — Auto-Escalation to Full Mode

**Story Goal**: When simple mode exhausts N iterations, the system auto-escalates to full mode with the failure summary injected as starting context for the Librarian.

**Independent Test Criteria**: Run against a problem intentionally unsolvable in simple mode. Confirm escalation triggers after N iterations, Librarian receives `escalationContext`, and full mode completes successfully with fewer iterations than a cold start would need.

- [x] T016 [US2] Add escalation trigger in `runCommand()` after simple mode loop — check `!noEscalate && !isBudgetExceeded(context) && !success`
- [x] T017 [US2] Call `buildFailureSummary(records)` and `withEscalationContext(context, summary)` at escalation point in `src/cli/commands/run.ts`
- [x] T018 [US2] Log escalation event — print summary preview (first 200 chars of `naturalLanguageSummary`) and remaining budget at handoff point
- [x] T019 [US2] Update `LibrarianAgent.initialize()` in `src/agents/librarian/librarian.agent.ts` — if `context.escalationContext` is present, prepend it to the analysis prompt with a clear header ("PRIOR ATTEMPTS:")
- [x] T020 [US2] Wire full mode loop after escalation — continue into existing `runSingleIteration()` loop using escalation-enriched context
- [x] T021 [US2] Update final report for escalation + full mode success output — show `Simple → Full (escalated)`, iterations per phase, cost per phase per `contracts/cli-interface.md`
- [x] T022 [P] [US2] Write unit tests for escalation trigger logic in `tests/unit/lifecycle/simple-escalation.test.ts` — verify triggers at correct iteration count, blocked when budget exhausted, blocked by `--no-escalate`
- [x] T023 [US2] Write integration test: escalation path in `tests/integration/escalation-flow.test.ts` — mock Artisan to fail N times in simple mode, confirm escalation fires, confirm Librarian prompt contains failure summary, confirm full mode succeeds

---

## Phase 5: User Story 3 — User Controls Escalation Behaviour

**Story Goal**: CLI flags `--no-escalate`, `--simple N`, and `--full` all work correctly. `--full` restores the original pre-002 behaviour exactly.

**Independent Test Criteria**: Test all three flags in isolation. `--no-escalate` exits on simple failure without full mode. `--simple 3` escalates exactly at iteration 3. `--full` skips simple mode entirely and goes directly to Librarian phase.

- [x] T024 [US3] Implement `--no-escalate` guard in `runCommand()` — after simple loop, if `noEscalate=true` and `!success`, skip escalation trigger and exit with failure report
- [x] T025 [US3] Implement `--full` bypass in `runCommand()` — if `fullMode=true`, skip simple mode loop entirely and jump directly to full mode loop
- [x] T026 [US3] Update final report for full-failure (both modes failed) output — show error summary for each phase per `contracts/cli-interface.md`
- [x] T027 [P] [US3] Write integration tests for flag behaviour in `tests/integration/escalation-flow.test.ts` — `--no-escalate` blocks full mode, `--full` skips simple mode, `--simple 3` escalates at exactly iteration 3

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, edge cases, and final test gate.

- [x] T028 Validate all 216 existing tests still pass with `npm test` — confirm no regressions from context type changes or run.ts modifications; total test count should be ≥ 230

---

## Dependencies

```
T001 → T002 → T003 → T004 (types foundation)
T001 → T005 (needs SimpleIterationRecord type)
T001 → T006 (needs FailureSummary type)
T007, T008 can run in parallel after T001
T009 → T010 → T011 (simple loop must exist before default wiring)
T005, T006, T007, T008 must be complete before T009
T012, T013, T014 can run in parallel with T009-T011 (different files)
T015 needs T009-T011 complete
T016 → T017 → T018 → T019 → T020 → T021 (escalation bridge is sequential)
T016 needs T015 (simple loop complete and tested)
T019 needs T017 (context must have escalationContext before Librarian reads it)
T022, T023 can run in parallel with T019-T021
T024 → T025 → T026 (flag implementations are sequential)
T024 needs T016 (escalation trigger must exist before guard can be added)
T027 needs T024-T026
T028 needs ALL tasks complete
```

## Parallel Execution Opportunities

**Wave 1 (after T004 complete)**:
- T005, T006, T007, T008 — all touch different parts, run in parallel

**Wave 2 (after T011 complete)**:
- T012, T013, T014 — different files (reporting vs unit tests), run in parallel

**Wave 3 (after T021 complete)**:
- T022, T023 — unit tests and integration tests, run in parallel

**Wave 4 (after T026 complete)**:
- T027 — then T028 as final gate

---

## Implementation Strategy

**MVP Scope**: Phases 1 + 2 + Phase 3 (User Story 1 only)
→ Delivers: Simple mode works, default N=5, exits on success, clean failure report
→ Value: Immediately cheaper and faster for all simple bugs
→ Escalation not yet wired — users who need it use `--full` flag

**Full Delivery**: All phases
→ Delivers: Complete escalation bridge, all CLI flags, per-phase reporting
→ Suggested order: US1 → US2 → US3 → Polish

---

## Summary

| Phase | Story | Tasks | Parallel Opportunities |
|---|---|---|---|
| Phase 1: Setup | — | T001–T004 | T003–T004 parallel after T001 |
| Phase 2: Foundational | — | T005–T008 | T007–T008 parallel |
| Phase 3: US1 | Simple mode success | T009–T015 | T012–T014 parallel |
| Phase 4: US2 | Auto-escalation | T016–T023 | T022–T023 parallel |
| Phase 5: US3 | User flags | T024–T027 | T027 parallel with T026 |
| Phase 6: Polish | — | T028 | — |
| **Total** | | **28 tasks** | **10 parallel opportunities** |
