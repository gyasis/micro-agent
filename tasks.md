# Tasks: Multi-Tier Model Escalation

**Branch**: `003-tiered-escalation`
**Input**: Design documents from `/specs/003-tiered-escalation/`
**Total Tasks**: 31
**Test tasks**: Included (unit and integration coverage per plan.md wave gates)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete sibling tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependency and create shared type definitions that all waves depend on.

- [x] T001 Install `better-sqlite3` and `@types/better-sqlite3` — add to `package.json` dependencies and devDependencies via `npm install better-sqlite3 && npm install -D @types/better-sqlite3`
- [x] T002 Create `src/lifecycle/types.ts` with shared interfaces: `TierAttemptRecord`, `TierRunResult`, `RunMetadataRow`, `AccumulatedFailureSummary` — field definitions from `specs/003-tiered-escalation/data-model.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config layer and CLI wiring — MUST be complete before any user story can run.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Create Zod schemas `TierModelsSchema`, `TierConfigSchema`, `TierEscalationConfigSchema` in `src/lifecycle/tier-config.ts` — schema exactly as specified in `specs/003-tiered-escalation/contracts/tier-config-schema.md` and `specs/003-tiered-escalation/research.md` Decision 2
- [x] T004 Implement `loadTierConfig(filePath: string): TierEscalationConfig` and `validateTierConfig(config): string[]` in `src/lifecycle/tier-config.ts` — reads JSON file, runs Zod parse, returns typed config or array of error strings; `validateTierConfig` returns ALL errors (not just first) so startup can report them all at once (FR-012)
- [x] T005 [P] Add `tierConfig?: string` field to `RunOptions` interface and register `--tier-config <path>` CLI flag in `src/ralph-loop.ts` — follows existing commander option registration pattern
- [x] T006 [P] Add `tierConfigFile?: string` to YAML config schema in `src/config/` (whichever file defines the config type) so that `micro-agent.yml` entries are respected as a fallback when `--tier-config` flag is absent

**Checkpoint**: Config can be loaded, validated, and passed to runCommand — user story implementation can now begin.

---

## Phase 3: User Story 1 — Zero-Cost First Pass (Priority: P1) 🎯 MVP

**Goal**: A developer configures Tier 1 as a local Ollama model. The agent runs only Tier 1, solves the problem at $0, and shows the startup tier plan, per-iteration output, and a per-tier final report. If Tier 1 is the only tier and it fails, the run exits cleanly.

**Independent Test Criteria**: Configure a single-tier local config (`ollama/codellama`, mode=simple, maxIterations=5). Run against a known-fixable bug. Confirm: (1) startup banner lists the tier, (2) per-iteration output shows artisan changes + test results, (3) success stops after first passing iteration, (4) final report shows cost=$0.00 and audit path. Run `sqlite3 .micro-agent/audit.db "SELECT * FROM tier_attempts"` and confirm rows written.

- [x] T007 [US1] Create `runTier(tier, tierIndex, context, agents, testRunner, db, runId)` in `src/lifecycle/tier-engine.ts` — implements the simple-mode iteration loop: calls `runSimpleIteration()` (from `src/cli/commands/run.ts`) up to `tier.maxIterations` times, records each iteration into `TierAttemptRecord[]`, checks `isBudgetExceeded()` after each iteration, exits loop on success or budget exhaustion, returns `TierRunResult` with `exitReason: 'success' | 'iterations_exhausted' | 'budget_exhausted' | 'provider_error'`
- [ ] T008 [US1] Wire tier engine into `runCommand()` in `src/cli/commands/run.ts` — detect `options.tierConfig ?? config.tierConfigFile`; if present: call `loadTierConfig()`, call `validateTierConfig()` and exit with all errors if invalid (before any LLM call), then enter tier loop; if absent: fall through to existing simple/full path unchanged
- [ ] T009 [US1] Add startup banner in `src/cli/commands/run.ts` when tier config is active — print tier plan table matching `contracts/cli-interface.md` "Startup" format: tier index, name, mode, model, max iterations
- [ ] T010 [US1] Add per-tier header output at start of each tier in `src/lifecycle/tier-engine.ts` — print `━━━━ ▶ Tier N/total: <name> [mode, model] ━━━━` divider matching `contracts/cli-interface.md` format
- [ ] T011 [US1] Add final report for single-tier outcome in `src/cli/commands/run.ts` — per-tier row table (name, mode, iterations, cost, status), total line, audit path + run ID, SQLite query hint on failure — matching all three report formats in `contracts/cli-interface.md`
- [x] T012 [P] [US1] Write unit tests for `loadTierConfig()` and `validateTierConfig()` in `tests/unit/lifecycle/tier-config.test.ts`:
  - Valid 3-tier config loads and parses correctly
  - Config with missing `artisan` model fails validation with descriptive error
  - Config with `mode` not in `['simple','full']` fails validation
  - Empty `tiers: []` fails with "at least 1 tier required"
  - File not found throws with descriptive path error
  - Invalid JSON throws with parse error detail

**Checkpoint**: Single-tier local config runs end-to-end. Startup banner shown, per-iteration output visible, final report matches contracts, cost=$0.00 for local models.

---

## Phase 4: User Story 2 — N-Tier Progressive Escalation (Priority: P2)

**Goal**: A 3-tier config escalates from local → mid → power. Each tier receives accumulated failure history from all prior tiers. Tier 3 is never called if Tier 2 succeeds. Tier mode (simple vs full) is independent per tier.

**Independent Test Criteria**: Configure 3 tiers (local ollama → claude-haiku simple → claude-sonnet full). Run against a bug that requires Tier 2 to solve. Confirm: (1) Tier 1 runs 5 iterations, (2) escalation event is logged with summary preview, (3) Tier 2 receives `escalationContext` containing "TIER 1 FAILURES" header, (4) Tier 2 solves it in iteration 2, (5) Tier 3 is never invoked, (6) final report shows Tier 3 as "— (not reached)".

- [x] T013 [US2] Create `buildAccumulatedSummary(priorResults: TierRunResult[]): AccumulatedFailureSummary` in `src/lifecycle/tier-accumulator.ts` — concatenates each prior tier's records into natural-language blocks with `=== TIER N FAILURES: <name> (K iterations) ===` headers; deduplicates error signatures across all tiers; caps total at 4000 characters by truncating oldest tier history first with `[truncated]` marker; includes total-across-tiers footer line
- [ ] T014 [P] [US2] Create `withTierEscalationContext(context: AgentContext, summary: AccumulatedFailureSummary): AgentContext` in `src/lifecycle/tier-accumulator.ts` — calls existing `withEscalationContext(context, summary.naturalLanguageSummary)` from `src/agents/base/agent-context.ts`; returns new context without mutating original
- [ ] T015 [US2] Extend `runTier()` in `src/lifecycle/tier-engine.ts` to support `full` mode tiers — when `tier.mode === 'full'`: calls `runSingleIteration()` (Librarian + Artisan + Critic + Tests) instead of `runSimpleIteration()`; Librarian receives `context.escalationContext` which was injected before this tier started
- [ ] T016 [US2] Add multi-tier escalation loop in `runCommand()` in `src/cli/commands/run.ts` — after each tier's `TierRunResult`:
  - If `exitReason === 'success'`: break loop, record success
  - If `exitReason === 'budget_exhausted'`: break loop, record budget failure
  - If `exitReason === 'iterations_exhausted'` and more tiers remain: call `buildAccumulatedSummary(allPriorResults)`, call `withTierEscalationContext()`, continue to next tier
  - If last tier and `iterations_exhausted`: record full failure
- [ ] T017 [US2] Add escalation event log in `src/cli/commands/run.ts` between tiers — print: tier failure summary, escalation target tier name, count of prior iterations carried forward — matching `contracts/cli-interface.md` "Tier Escalation Event" format
- [ ] T018 [P] [US2] Update final report in `src/cli/commands/run.ts` for multi-tier outcomes — all three report scenarios (success mid-tier, all-failed, budget-stopped) from `contracts/cli-interface.md`; "— (not reached)" for skipped tiers
- [x] T019 [P] [US2] Write unit tests for `buildAccumulatedSummary()` in `tests/unit/lifecycle/tier-accumulator.test.ts`:
  - Single prior tier: header + history in output
  - Two prior tiers: both headers present, combined unique error signatures
  - Truncation at 4000 chars: oldest tier truncated, `[truncated]` marker present, newest tier preserved
  - Zero prior tiers: returns empty summary (no crash)
  - `withTierEscalationContext()` returns new context with `escalationContext` set; original context unchanged
- [x] T020 [US2] Write integration test for 2-tier escalation flow in `tests/integration/tier-engine.test.ts`:
  - Mock tier 1 artisan to fail `maxIterations` times; confirm `TierRunResult.exitReason === 'iterations_exhausted'`
  - Confirm `buildAccumulatedSummary` output contains "TIER 1 FAILURES" header
  - Confirm tier 2 context has `escalationContext` set before it runs
  - Mock tier 2 artisan to succeed on iteration 2; confirm `TierRunResult.exitReason === 'success'`
  - Confirm tier 3 (if configured) is never invoked

**Checkpoint**: Multi-tier escalation works end-to-end. Accumulated context passes between tiers. No tier starts cold.

---

## Phase 5: User Story 3 — SQLite Failure Audit Log (Priority: P3)

**Goal**: Every iteration at every tier is written to `.micro-agent/audit.db`. Runs are never blocked by DB failures. Each run gets a UUID that groups all its records. Users can query the full history after all tiers fail.

**Independent Test Criteria**: Run the agent with a 2-tier config against an intentionally unsolvable problem. After all tiers exhaust, run `sqlite3 .micro-agent/audit.db` and confirm: (1) `run_metadata` has one row with `outcome='failed'`, (2) `tier_attempts` has one row per iteration for each tier, (3) `failed_tests` and `error_messages` are JSON arrays, (4) `cost_usd=0.0` for Ollama rows. Run again — confirm second run adds new rows without overwriting first.

- [x] T021 [US3] Create `openAuditDatabase(dbPath: string): Database` in `src/lifecycle/tier-db.ts` — creates directory if missing, opens SQLite file with `better-sqlite3`, runs DDL from `specs/003-tiered-escalation/contracts/sqlite-schema.md` (both `CREATE TABLE IF NOT EXISTS` statements and all three indexes); returns database handle
- [ ] T022 [US3] Create `writeAttemptRecord(db: Database, record: TierAttemptRecord): void` in `src/lifecycle/tier-db.ts` — prepared `INSERT INTO tier_attempts (...)` statement with all columns; `failedTests` and `errorMessages` serialized as `JSON.stringify()`; entire call wrapped in `try/catch`; on error: `logger.warn('[audit] DB write failed: ...')` and return (never throw)
- [ ] T023 [P] [US3] Create `writeRunMetadata(db: Database, metadata: RunMetadataRow): void` and `updateRunMetadata(db: Database, runId: string, updates: Partial<RunMetadataRow>): void` in `src/lifecycle/tier-db.ts` — `writeRunMetadata` does `INSERT INTO run_metadata`; `updateRunMetadata` does `UPDATE run_metadata SET ... WHERE run_id = ?`; both wrapped in `try/catch` with `logger.warn` on failure
- [ ] T024 [P] [US3] Create `closeAuditDatabase(db: Database): void` in `src/lifecycle/tier-db.ts` — calls `db.close()` in `try/catch`; logs warning on failure but never throws
- [ ] T025 [US3] Wire DB writes into `runTier()` in `src/lifecycle/tier-engine.ts` — after each iteration completes, call `writeAttemptRecord(db, record)` with all fields populated: `runId`, `tierIndex`, `tierName`, `tierMode`, `modelArtisan`, `modelLibrarian` (null for simple mode), `modelCritic` (null for simple mode), `iteration`, `codeChangeSummary`, `testStatus`, `failedTests`, `errorMessages`, `costUsd`, `durationMs`, `timestamp` (ISO 8601 UTC)
- [ ] T026 [US3] Wire run metadata into `runCommand()` in `src/cli/commands/run.ts` — generate `runId = uuidv4()` at run start; call `openAuditDatabase(resolvedDbPath)` where `resolvedDbPath` is `global.auditDbPath` resolved relative to `options.workingDirectory`; call `writeRunMetadata()` with `outcome='in_progress'`; after all tiers complete, call `updateRunMetadata()` with final `outcome`, `completedAt`, `resolvedTierName`, `resolvedIteration`; call `closeAuditDatabase()` in a `finally` block
- [ ] T027 [US3] Show audit log path and run ID in final report in `src/cli/commands/run.ts` — `Audit: <path>  (run: <runId[:8]>)`; when all tiers fail, also print the SQLite query hint: `sqlite3 <path> "SELECT * FROM tier_attempts WHERE run_id='<runId>' ORDER BY tier_index, iteration;"`
- [x] T028 [P] [US3] Write unit tests for `tier-db.ts` in `tests/unit/lifecycle/tier-db.test.ts` (use in-memory `:memory:` path for speed):
  - `openAuditDatabase(':memory:')` creates both tables and all indexes without error
  - `openAuditDatabase(':memory:')` is idempotent (calling twice doesn't throw)
  - `writeAttemptRecord()` inserts one row and it is readable via SELECT
  - `writeAttemptRecord()` with a closed DB does NOT throw (best-effort)
  - `writeRunMetadata()` inserts a row; `updateRunMetadata()` changes its `outcome` field
  - JSON arrays (`failedTests`, `errorMessages`) round-trip correctly through JSON.stringify/parse

**Checkpoint**: Every iteration is persisted. Append-only, never blocks run. Users can query full audit history after any run.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improve robustness, user experience, and confirm zero regressions.

- [ ] T029 [P] Add warning in `src/cli/commands/run.ts` when legacy flags (`--simple`, `--full`, `--no-escalate`) are used alongside `--tier-config` — log `logger.warn('⚠ --tier-config is active; --simple/--full/--no-escalate flags are ignored')` before entering tier engine path
- [ ] T030 [P] Add validation error reporter in `runCommand()` in `src/cli/commands/run.ts` — when `validateTierConfig()` returns errors, print each error with index (`Error 1: ...`, `Error 2: ...`) and a trailing `Fix the errors above and re-run. No LLM calls were made.` line; then `process.exit(1)` — matching `contracts/cli-interface.md` "Validation Error Output" format
- [ ] T031 Run full vitest test suite and confirm ≥ 290 tests pass (247 existing + ~43 new); confirm zero regressions — `npx vitest run`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — can start as soon as T003–T006 complete
- **Phase 4 (US2)**: Depends on Phase 2 AND T007 (runTier from US1) — T013–T020 build on the tier engine
- **Phase 5 (US3)**: Depends on Phase 2 AND T007 (runTier needs db parameter) — SQLite layer is independent of US2 logic
- **Phase 6 (Polish)**: Depends on all prior phases complete

### User Story Dependencies

- **US1 (P1)**: Needs T003–T006 (config layer) → can start immediately after Foundational
- **US2 (P2)**: Needs T007 (`runTier` exists) → starts after US1 T007 completes
- **US3 (P3)**: Needs T007 (`runTier` signature includes `db` param) → can start in parallel with US2 T013–T020

### Within Each User Story

- T007 (runTier simple mode) before T015 (extend for full mode)
- T013 (buildAccumulatedSummary) before T016 (use in escalation loop)
- T021 (openAuditDatabase) before T022/T023/T024 (write functions)
- T021–T024 (tier-db functions) before T025 (wire into runTier)
- T025 (wire DB into runTier) before T026 (wire run metadata into runCommand)

### Parallel Opportunities

Within Phase 3 (US1): T012 can run in parallel with T007–T011 (different files)
Within Phase 4 (US2): T014, T019 can run in parallel with T013, T015; T018 can run with T016
Within Phase 5 (US3): T023, T024 can run in parallel with T022; T028 can run with T021–T024
Within Phase 6: T029 and T030 can run in parallel

---

## Parallel Example: User Story 3 (SQLite)

```
# Launch DB function implementations in parallel (all different files/functions):
Task: "Create openAuditDatabase() in src/lifecycle/tier-db.ts"  [T021]
Task: "Create writeRunMetadata() + updateRunMetadata() in src/lifecycle/tier-db.ts"  [T023]
Task: "Create closeAuditDatabase() in src/lifecycle/tier-db.ts"  [T024]

# Then sequentially (T022 depends on T021 table existing):
Task: "Create writeAttemptRecord() in src/lifecycle/tier-db.ts"  [T022]

# Can run in parallel with the above:
Task: "Write unit tests for tier-db.ts in tests/unit/lifecycle/tier-db.test.ts"  [T028]
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T006)
3. Complete Phase 3: US1 (T007–T012)
4. **STOP and VALIDATE**: `ma-loop run <file> --tier-config ./tiers-local-only.json` runs a 1-tier local config and exits successfully at $0
5. Demo: Local Ollama model solves a simple bug, zero API cost

### Incremental Delivery

1. Setup + Foundational → config loads, flag works
2. **US1** → single tier runs (MVP!)
3. **US2** → multi-tier escalation works, accumulated context passes
4. **US3** → audit log persists all history
5. **Polish** → warnings, error formatting, regression gate

### Parallel Team Strategy

With multiple developers after Phase 2 completes:
- **Developer A**: US1 (T007–T012) — tier engine + run.ts wiring
- **Developer B**: US2 (T013–T020) — accumulator + escalation loop (can start T013/T014 while Dev A finishes T007)
- **Developer C**: US3 (T021–T028) — SQLite layer (completely independent of US2)

---

## Notes

- All tasks reference exact file paths from `specs/003-tiered-escalation/plan.md` Project Structure
- [P] tasks = operate on different files, safe to parallelize
- SQLite writes are ALWAYS best-effort — never throw, never block the run
- `runSimpleIteration()` and `runSingleIteration()` in `src/cli/commands/run.ts` are reused unchanged — tier engine delegates to them
- `withEscalationContext()` from `src/agents/base/agent-context.ts` is reused unchanged — tier accumulator delegates to it
- Use `JSON.stringify()` for `failedTests`/`errorMessages` DB columns and `JSON.parse()` when reading back
- `auditDbPath` must be resolved relative to `options.workingDirectory`, not `process.cwd()`
- The `--tier-config` flag takes precedence over `tierConfigFile` in YAML when both are present
