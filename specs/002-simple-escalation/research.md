# Research: Simple Mode with Auto-Escalation

**Feature**: 002-simple-escalation
**Date**: 2026-02-16
**Status**: Complete — no NEEDS CLARIFICATION items remain

---

## Decision 1: How Simple Mode Skips Librarian and Critic

**Decision**: Simple mode calls a new `runSimpleIteration()` function that executes only phases 2 (Artisan) and 4 (Tests) from the existing `runSingleIteration()`. Phases 1 (Librarian) and 3 (Critic) are entirely skipped.

**Rationale**: The existing `runSingleIteration()` in `src/cli/commands/run.ts` already has the four phases cleanly separated. It is straightforward to extract a slimmed version that only calls `agents.artisan` and the test runner. The Artisan still receives the target file content and the previous test failure output via `AgentContext.test.lastResult` — it just doesn't have the Librarian's `relatedFiles` enrichment.

**Alternatives considered**:
- Pass a flag to `runSingleIteration()` to skip phases — rejected because it creates conditional spaghetti in the main loop function; a separate function is cleaner
- Create a separate "SimpleArtisan" agent subclass — rejected because the existing ArtisanAgent is already capable; no new agent type needed

---

## Decision 2: Structure of the FailureSummary

**Decision**: FailureSummary is a plain TypeScript object captured in-memory during the simple mode loop, then serialized to a structured text block injected into the Librarian's system prompt at escalation time.

**Format**:
```
SIMPLE MODE HISTORY (5 iterations, all failed):

Iteration 1: Changed multiply() return from `a + b` to `a - b`. Test failed: "Expected 12, received -1"
Iteration 2: Changed multiply() return to `a * b`. Test failed: "Expected 12, received NaN" (input was undefined)
Iteration 3: Added null guard. Test still failed: "Expected 12, received NaN" (edge case not handled)
...

Unique error signatures: ["Expected N, received M", "received NaN"]
Suggested focus: The issue involves edge case inputs, not the core multiply logic.
```

**Rationale**: Plain text is universally readable by all LLM providers. Structured data (JSON) would require the Librarian's prompt engineering to be updated to parse it. Text narrative is what LLMs handle best as context.

**Alternatives considered**:
- Write FailureSummary to disk (e.g., `.micro-agent-history.json`) — rejected for this feature; adds disk I/O complexity with no benefit since it's used only within a single run
- Pass the raw diff of each attempt — rejected because diffs are noisy; a description of what changed is more useful to the Librarian

---

## Decision 3: Default N for Simple Mode

**Decision**: N=5 simple iterations before escalation by default.

**Rationale**: Analysis of the existing `runAll()` loop behavior (old main branch) shows most simple bugs are solved in 1-3 iterations. N=5 gives enough rope to solve 90%+ of simple problems while keeping cost low (5 × ~$0.005 = ~$0.025 before escalation). Aligns with `spec.md` FR-002.

**Alternatives considered**:
- N=3: Too few — some simple bugs need a few attempts to converge
- N=10: Too many — if not solved in 5, it's probably a complex problem needing full mode

---

## Decision 4: Escalation Trigger Logic

**Decision**: Escalation triggers when `simpleIteration >= simpleMaxIterations && !success`. It does NOT trigger on budget exhaustion — if budget is gone, the process exits cleanly with a budget message, no escalation attempted.

**Rationale**: Escalation requires budget headroom. If cost/time budget is exhausted, escalation would immediately hit the budget check and fail too, wasting a LLM call to the Librarian. Better to exit cleanly.

**Implementation location**: Inside the main `while` loop in `run.ts`, after the simple mode sub-loop exits.

---

## Decision 5: Where FailureSummary is Injected

**Decision**: Injected as an additional field in `AgentContext` (`escalationContext?: string`) which the Librarian agent reads from its `context.escalationContext` and prepends to its analysis prompt.

**Rationale**: `AgentContext` already carries `librarianContext`, `artisanCode`, `criticReview`, and `test.lastResult`. Adding `escalationContext` is consistent with this pattern. The Librarian already reads from `AgentContext` during `initialize()`.

**Alternatives considered**:
- Pass as a CLI environment variable — too hacky
- Add to the test command string — wrong abstraction layer

---

## Existing Code Reuse Map

| New Piece | Reuses |
|---|---|
| `runSimpleIteration()` | `agents.artisan.execute()` + `testRunner.runTests()` from existing `runSingleIteration()` |
| `buildFailureSummary()` | `RalphTestResult.tests[]` from existing test parser output |
| Escalation trigger | `iterationManager.shouldResetContext()` pattern |
| Full mode post-escalation | Existing `runSingleIteration()` unchanged |
| CLI flags | Existing `commander` option registration in `ralph-loop.ts` |
| Budget check | Existing `isBudgetExceeded()` from `agent-context.ts` |

---

## No NEEDS CLARIFICATION Items

All decisions resolved. Ready for Phase 1 design.
