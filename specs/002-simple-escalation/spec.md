# Feature Specification: Simple Mode with Auto-Escalation

**Feature Branch**: `002-simple-escalation`
**Created**: 2026-02-16
**Status**: Draft

## Overview

Micro Agent currently runs a full multi-agent pipeline on every iteration. This is powerful but heavyweight for simple problems. This feature introduces two operating modes and an automatic escalation bridge:

- **Simple Mode**: Artisan + Tests only. Fast, cheap, minimal context. Ideal for isolated method fixes and clear logic bugs.
- **Full Mode**: Complete pipeline (context analysis → code generation → review → tests). Deep context, codebase awareness. Ideal for complex cross-file problems.
- **Auto-Escalation**: If Simple Mode exhausts its iteration budget without success, it automatically hands off to Full Mode — carrying a structured summary of everything tried and why it failed. Full Mode starts informed, not blind.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Simple Mode Solves the Problem (Priority: P1)

A developer has a failing test for a single method. They run Micro Agent in simple mode with a small iteration budget. The agent iterates quickly and cheaply, modifying only that method until the test passes.

**Why this priority**: This is the core use case. Most bugs are simple. Simple mode should handle them faster and cheaper than full mode. Delivering this alone provides immediate user value.

**Independent Test**: Can be fully tested by running `ma-loop run --simple 5 src/math.ts` against a file with a known bug and confirming it passes tests within budget.

**Acceptance Scenarios**:

1. **Given** a file with a failing test and a simple logic bug, **When** the user runs simple mode with N=5 iterations, **Then** the bug is fixed within N iterations and tests pass
2. **Given** simple mode running, **When** a test passes on iteration 3 of 5, **Then** the loop exits immediately with success — no unnecessary iterations consumed
3. **Given** simple mode running, **When** the budget (cost or time) is exhausted before success, **Then** the loop stops cleanly and reports failure with all attempt summaries

---

### User Story 2 - Auto-Escalation to Full Mode (Priority: P2)

A developer runs simple mode on a method that turns out to be more complex than expected — it has hidden dependencies or cross-file issues. Simple mode exhausts its iterations. Instead of just failing, the system escalates to full mode automatically, handing it a rich summary of what was already tried.

**Why this priority**: This is the key differentiator. Without escalation, users must manually re-run in full mode and lose all context. Escalation preserves the work done and dramatically improves full mode's starting position.

**Independent Test**: Can be fully tested by providing a problem intentionally too complex for simple mode alone, confirming escalation triggers, and confirming the context analysis phase receives the failure summary.

**Acceptance Scenarios**:

1. **Given** simple mode runs N iterations all failing, **When** the iteration limit is hit, **Then** escalation triggers automatically without user intervention
2. **Given** escalation triggered, **When** full mode starts, **Then** the context analysis phase receives a structured summary: iteration count, test names that failed, error messages, and what code changes were attempted
3. **Given** full mode running post-escalation, **When** the code generator produces output, **Then** it does not repeat the exact same changes that simple mode already tried and failed
4. **Given** full mode post-escalation succeeds, **When** reporting final results, **Then** the output clearly shows total iterations across both modes and total cost

---

### User Story 3 - User Controls Escalation Behaviour (Priority: P3)

A developer wants explicit control: they can force simple-only (no escalation), set how many simple iterations run before escalation, or start directly in full mode — all via CLI flags.

**Why this priority**: Power users need control. Some want fast-fail (simple only), others want to tune the escalation threshold.

**Independent Test**: Can be fully tested by running with `--no-escalate` and confirming full mode never starts, and with `--simple 3` confirming escalation triggers exactly at iteration 3.

**Acceptance Scenarios**:

1. **Given** `--no-escalate` flag, **When** simple mode exhausts iterations, **Then** the process exits with failure — full mode never runs
2. **Given** `--simple N` where N is user-specified, **When** simple mode has run exactly N iterations without success, **Then** escalation triggers
3. **Given** no flags, **When** the user runs `ma-loop run`, **Then** default behaviour is simple mode with N=5, auto-escalation enabled

---

### Edge Cases

- What happens when simple mode is escalating but the overall budget has already been consumed? → Escalation is blocked; user sees: "Budget exhausted before escalation could start"
- What happens if simple mode succeeds on iteration 1? → Exit immediately, no escalation, minimal cost reported
- What if the test command itself is broken (not the code)? → Repeated infrastructure errors (not code errors) surface a clear warning rather than consuming all iterations on a non-fixable problem
- What if escalation triggers but the remaining full-mode budget is already zero? → Full mode is skipped with a warning; final report shows both mode summaries

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a `--simple N` CLI flag that runs code generation + tests only for N iterations before considering escalation
- **FR-002**: System MUST default to simple mode with N=5 iterations when no mode flags are provided
- **FR-003**: System MUST automatically escalate to full mode when simple mode exhausts N iterations without passing tests
- **FR-004**: System MUST generate a structured failure summary after simple mode exhausts iterations, capturing: total iterations run, list of failed test names, error messages per iteration, and description of code changes attempted
- **FR-005**: System MUST pass the failure summary as starting context to the context analysis phase of full mode
- **FR-006**: System MUST support `--no-escalate` flag to disable automatic escalation (simple mode only, exits on failure)
- **FR-007**: System MUST support `--full` flag to skip simple mode entirely and run the full pipeline from the start
- **FR-008**: System MUST respect existing budget constraints (cost, time, max iterations) across both simple and full mode phases combined
- **FR-009**: System MUST report in final output: which mode(s) ran, iterations per mode, cost per mode, and total combined cost
- **FR-010**: System MUST reset LLM context completely between every iteration in both simple and full mode (Ralph Loop fresh-context gold standard preserved)

### Key Entities

- **SimpleIteration**: One pass of code generation + tests. Captures: attempt number, code change description, test results, error messages
- **FailureSummary**: Compressed record of all simple mode attempts. Passed as starting context to full mode. Contains: iteration count, unique error signatures, attempted fix patterns, final test state
- **EscalationEvent**: The handoff moment. Records: trigger reason (iterations exhausted), timestamp, failure summary, remaining budget at handoff

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Simple problems (single method, clear logic error) are resolved in 50% fewer LLM calls compared to full mode running the same problem
- **SC-002**: Simple mode cost per iteration is at least 60% cheaper than full mode cost per iteration (no context analysis or review agent calls)
- **SC-003**: When escalation occurs, full mode solves the problem in fewer iterations than it would without the failure summary context
- **SC-004**: Auto-escalation triggers within 1 second of simple mode exhausting its budget — no perceptible delay
- **SC-005**: The failure summary passed to full mode contains all unique error messages from simple mode — no information is lost in the handoff
- **SC-006**: Users can fix a simple single-method bug in under 60 seconds end-to-end using default simple mode settings

---

## Assumptions

- Default N for simple mode is 5 iterations (configurable via `--simple N` CLI flag; `.micro-agent.json` config support is out of scope for this feature)
- "Simple mode" means code generation + tests only — the code generator still receives the target file content and failing test output as context, just no full codebase scan
- Escalation is always to the same full pipeline that already exists — no new agent types introduced
- The failure summary is plain text injected into the context analysis agent's starting prompt — not a new data structure on disk
- Budget is shared: `--max-budget $0.50` covers both simple and full mode phases combined
- Escalation is one-way and one-time: if full mode also fails, the process exits — no second escalation loop
