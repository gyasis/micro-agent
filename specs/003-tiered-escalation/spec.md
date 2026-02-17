# Feature Specification: Multi-Tier Model Escalation

**Feature Branch**: `003-tiered-escalation`
**Created**: 2026-02-17
**Status**: Draft

## Summary

Users can define an ordered sequence of model tiers — from free local models up to the most capable
cloud models — and the system automatically escalates through each tier only when the previous one
fails. Failure history is accumulated across all tiers and passed forward so each escalation starts
informed, not cold. A persistent failure log gives users a full audit trail if manual intervention
is eventually needed. This is an opt-in feature; the existing default two-mode behaviour (simple → full) is unchanged.

---

## User Scenarios & Testing

### User Story 1 — Zero-Cost First Pass (Priority: P1)

A developer configures a local free model (e.g. an Ollama model) as their Tier 1. When they run
the agent, it first attempts the problem using only local compute at no API cost. If the local
model solves the problem, they pay nothing. If it fails after N iterations, the system escalates
to Tier 2 (a paid cloud model) automatically, carrying the full failure history forward.

**Why this priority**: This is the primary economic motivation. 80% of tasks are expected to be
solved by Tier 1, making the cost savings immediate and significant for any team running many
iterations per day.

**Independent Test**: Configure a single-tier local setup. Run against a simple known-fixable bug.
Confirm it resolves without any API calls to paid providers and at zero cost.

**Acceptance Scenarios**:

1. **Given** a tier config with Tier 1 set to a local model, **When** the agent runs and the local model fixes the bug within N iterations, **Then** zero paid API calls are made and total cost is $0.00.
2. **Given** a tier config with Tier 1 local and Tier 2 cloud, **When** Tier 1 exhausts N iterations without success, **Then** the system escalates to Tier 2 automatically and carries all Tier 1 failure records forward.
3. **Given** Tier 1 is running, **When** a global budget limit is reached mid-tier, **Then** escalation is blocked and the run exits cleanly with a budget-exhausted failure report.

---

### User Story 2 — N-Tier Progressive Escalation (Priority: P2)

A developer defines three or more tiers in a JSON config file: local → mid-grade cloud → high-grade
cloud. The system works through each tier in order. Each escalation bundles all prior failure
history and injects it into the next tier's context so the more capable model starts with full
knowledge of what was already attempted.

**Why this priority**: This is the core differentiation from the existing two-mode system. It
enables teams to precisely control the cost/capability tradeoff across arbitrary model combinations.

**Independent Test**: Configure three tiers (local, mid, power). Run against a bug that requires
the mid-tier to solve. Confirm Tier 1 runs N iterations, Tier 2 receives the Tier 1 failure summary
and solves the bug, and Tier 3 is never invoked.

**Acceptance Scenarios**:

1. **Given** a 3-tier config, **When** Tier 1 fails and Tier 2 succeeds, **Then** Tier 3 is never invoked and the final report shows per-tier iteration counts and costs.
2. **Given** a 3-tier config, **When** Tiers 1 and 2 both fail, **Then** Tier 3 receives a combined failure summary from both prior tiers and runs its own iteration loop.
3. **Given** any escalation, **When** the higher tier starts, **Then** the failure history from all prior tiers is available in that tier's context — no tier starts cold.
4. **Given** a tier defines "simple" mode, **When** that tier runs, **Then** only the code-generation agent runs (no context-analysis or review agents), keeping that tier cheap and fast.
5. **Given** a tier defines "full" mode, **When** that tier runs, **Then** all three agents (context analysis, code generation, code review) are invoked in sequence.

---

### User Story 3 — SQLite Failure Audit Log (Priority: P3)

Every attempt at every tier — iteration number, what was changed, which tests failed, exact error
messages, cost, and duration — is written to a local SQLite database file. If all tiers are
exhausted without success, the user can query this file to see the complete history before
performing a manual fix. The database persists across runs and is never overwritten.

**Why this priority**: Escalation failures are rare but high-stakes. When the system cannot solve
something automatically, the developer needs a complete audit trail to make informed decisions
about manual intervention. This transforms a dead end into a starting point.

**Independent Test**: Run the agent against an intentionally unsolvable problem with two tiers.
Confirm the SQLite file is created, contains records for every iteration of both tiers, and
per-tier failure summaries are accurate and queryable.

**Acceptance Scenarios**:

1. **Given** any run (success or failure), **When** the run completes, **Then** every iteration at every tier is recorded with: tier name, model used, iteration number, code change summary, test status, failed test names, error messages, cost, and duration.
2. **Given** all tiers exhausted without success, **When** the user queries the SQLite file, **Then** they can retrieve the full per-tier history including every failed test and error message from every iteration.
3. **Given** a successful run, **When** the user queries the SQLite file, **Then** the successful iteration is also recorded, showing which tier solved it, which iteration number, and the cost.
4. **Given** multiple sequential runs, **When** the user queries the SQLite file, **Then** each run is a separate record with its own run ID and timestamp — history is never overwritten.

---

### Edge Cases

- What happens when a local model provider is offline or not installed? The tier fails immediately with a clear error message, counts as an escalation trigger, and the next tier starts if configured.
- What happens when only one tier is defined and it fails? The system exits with a failure report — no escalation occurs since there is no next tier.
- What happens if a tier's model returns garbled or invalid output? The iteration is recorded as an error in the SQLite log, counts against the tier's iteration budget, and the loop continues.
- What happens when global budget is exhausted mid-tier? The current tier exits immediately and escalation to the next tier is blocked even if the tier's own iteration limit is not yet reached.
- What happens if the SQLite file is locked by another process? The run continues normally; the failure record write is skipped with a warning. The run outcome is not affected.
- What if a tier config references a model that does not exist? The system validates the entire tier config at startup and exits with a descriptive error before making any LLM calls.
- What happens if no tier config file is provided? The system falls back to the existing default behaviour (simple mode → full mode) exactly as before — zero behaviour change.

---

## Requirements

### Functional Requirements

- **FR-001**: Users MUST be able to define an ordered list of model tiers in a JSON configuration file, where each tier specifies its name, mode (simple or full), the model for each agent role, and its maximum iteration count.
- **FR-002**: The system MUST execute tiers in the order defined, attempting each tier's full iteration budget before considering escalation.
- **FR-003**: The system MUST automatically escalate to the next defined tier when the current tier exhausts its iteration budget without success.
- **FR-004**: The system MUST pass the accumulated failure history from all prior tiers forward to each new tier so no tier starts without context.
- **FR-005**: Each tier MUST be independently configurable as either "simple" mode (code generation + tests only) or "full" mode (context analysis + code generation + review + tests).
- **FR-006**: The global budget (cost cap, time cap, total iteration cap) MUST be shared across all tiers and takes precedence over any per-tier iteration limit.
- **FR-007**: When the global budget is exhausted during any tier, the run MUST exit immediately without starting any further tiers.
- **FR-008**: Every iteration at every tier MUST be written to a persistent local database, recording: run ID, tier name, tier model, iteration number, code change summary, test status, failed test names, error messages, cost, and duration.
- **FR-009**: The database file path MUST be configurable. The default path MUST be local to the project's working directory.
- **FR-010**: Tiered escalation MUST be opt-in. When no tier config is provided, the existing default behaviour MUST be preserved exactly with zero regressions.
- **FR-011**: The final run report MUST show per-tier iteration counts, per-tier cost, and which tier (if any) solved the problem.
- **FR-012**: The system MUST validate the entire tier config at startup and report all configuration errors before making any LLM calls.

### Key Entities

- **TierConfig**: A single tier definition — name, mode, per-agent model assignments, max iterations for this tier.
- **TierEscalationConfig**: The full ordered list of TierConfig entries plus global settings (database path, budget overrides).
- **TierAttemptRecord**: One iteration within one tier — all fields needed for the database row and for building the failure summary passed to the next tier.
- **RunRecord**: Top-level grouping of all TierAttemptRecords for a single `ma-loop run` invocation — identified by run ID, timestamp, target file or objective.
- **AccumulatedFailureSummary**: Combined natural-language summary of all prior tiers' failures, injected into the next tier's context prompt.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: At least 80% of simple bugs are resolved at Tier 1 (when configured as a local/free model) with zero paid API cost.
- **SC-002**: Escalation handoff between any two tiers completes in under 2 seconds (excluding the next tier's first LLM call).
- **SC-003**: The failure log captures 100% of iterations across all tiers with no data loss, including runs interrupted by budget exhaustion.
- **SC-004**: A developer can define a 3-tier escalation config and run it end-to-end by changing only the JSON config file — no source code changes required.
- **SC-005**: The total cost of solving a problem via tiered escalation is equal to or less than solving it with the single most powerful model from the start, for at least 80% of problems tested.
- **SC-006**: All existing default behaviour (simple → full without a tier config) is preserved exactly — zero regressions for users who do not opt in.

---

## Assumptions

- A "local model" is any model the user configures without a paid API key — no special "local" flag exists in the tier config; cost is zero because the provider bills nothing.
- The local model runtime (e.g. Ollama) must already be installed and running before the agent starts; the agent does not manage model download or server lifecycle.
- The failure summary passed between tiers uses the same `naturalLanguageSummary` format from `002-simple-escalation`, with each tier's summary appended cumulatively.
- Per-tier iteration limits are soft caps; the global budget is the hard cap. A tier may stop before its iteration limit if global budget runs out.
- The tier config JSON file is a separate file referenced from the existing YAML config — it is not embedded in YAML — for clarity and editability.
- The database is append-only. Old run records are never automatically deleted. Users manage retention manually.
- The database write is best-effort: if it fails, the run continues and a warning is logged. The run outcome is never blocked by a database write failure.
