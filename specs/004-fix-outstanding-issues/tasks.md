# Tasks: Fix All Outstanding Issues (004)

**Branch**: `004-fix-outstanding-issues`
**Input**: Design documents from `/specs/004-fix-outstanding-issues/`
**Total Tasks**: 27
**Test tasks**: Included for US3 (ChromaDB fallback — new behaviour requires unit tests)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete sibling tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)

---

## Phase 1: Setup

**Purpose**: Confirm branch state and environment before making changes.

- [ ] T001 Confirm active branch is `004-fix-outstanding-issues` and `npm test` reports 269/269 before any changes (baseline validation)

---

## Phase 2: Foundational — TypeScript Upgrade (Priority: P1) 🎯 Unblocks all typecheck gates

**Purpose**: TypeScript 4.9.5 → 5.9.3 upgrade resolves all 500+ spurious typecheck errors from
Zod v4 and XState `.d.cts` declaration files. All subsequent fixes are validated by a working
`tsc --noEmit`. This phase MUST complete before any acceptance gate can be trusted.

**⚠️ CRITICAL**: All subsequent stories' acceptance gates run `npx tsc --noEmit` — this phase must pass first.

**Independent Test**: `npx tsc --noEmit` exits 0 with zero output; `npm test` 269/269 pass.

- [ ] T002 [US1] Update `typescript` to `^5.9.3`, `@typescript-eslint/parser` to `^8.0.0`, `@typescript-eslint/eslint-plugin` to `^8.0.0`, and `@types/node` to `^18.21.0` in `package.json` devDependencies — see `contracts/typescript-upgrade.md` for exact versions
- [ ] T003 [US1] Run `npm install` to update `node_modules` and `package-lock.json` from the version changes in T002
- [ ] T004 [US1] Change `"moduleResolution": "node"` to `"moduleResolution": "node16"` in `tsconfig.json` (line 8) — required for TypeScript 5.x ESM resolution; no other fields change
- [ ] T005 [US1] Verify acceptance gate: run `npx tsc --noEmit` and confirm exit code 0 with zero output (previously 500+ errors); if any src/ errors remain, fix them before proceeding
- [ ] T006 [US1] Verify regression gate: run `npm test` and confirm 269/269 pass with no regressions from the TS upgrade

**Checkpoint**: `npx tsc --noEmit` exits 0. All acceptance gates below are now trustworthy.

---

## Phase 3: User Story 2 — Silent Lint (Priority: P2)

**Goal**: Eliminate all 114 prettier warnings by adding comprehensive ignore patterns.
`src/` remains uncovered so real source quality is still enforced.

**Independent Test**: `npx prettier --check "**/*.ts"` exits 0, zero `[warn]` lines. `npm test` 269/269.

- [ ] T007 [US2] Replace the 3-line `.prettierignore` at project root with the full 22-pattern file from `contracts/prettierignore.md` — preserves existing 3 patterns, adds `dist/`, `node_modules/`, `specs/`, `PRD/`, `research_reports/`, `docs/tutorials/*.ipynb`, `test/`, `tests/`, `test-example/`, `scripts/`, `.specstory/`, `.specify/`, `memory-bank/`, `.vscode/`, `.devkid/`, `.claude/`, `.husky/`, `.github/`; confirm `src/` is NOT in the file
- [ ] T008 [US2] Verify acceptance gate: run `npx prettier --check "**/*.ts"` and confirm exit code 0 with zero `[warn]` lines (down from 114); run `npm test` 269/269

**Checkpoint**: Lint is clean. No false positives drown out real formatting issues.

---

## Phase 4: User Story 3 — Offline-Safe Memory Vault (Priority: P3)

**Goal**: MemoryVault gracefully degrades when ChromaDB is unreachable — logs one advisory
warning, returns empty results, never throws. Existing behaviour when ChromaDB IS present
is unchanged.

**Independent Test**: All tests pass including 4 new unit tests for the offline fallback.

- [ ] T009 [US3] Add `private connected: boolean = true;` field to the `MemoryVault` class body in `src/memory/memory-vault.ts` (after existing private fields, before constructor)
- [ ] T010 [US3] Refactor `initialize()` in `src/memory/memory-vault.ts` to wrap both `getOrCreateCollection()` calls in `Promise.race` against a 3-second timeout; on any rejection catch: set `this.connected = false`, log `warn('[MemoryVault] ChromaDB unavailable — running in no-op mode', { error })`, and do NOT re-throw — see `contracts/memoryvault-fallback.md` for exact code shape
- [ ] T011 [US3] Add `if (!this.connected) return;` guard (or `return []` / `return { fixPatterns: 0, testPatterns: 0 }` as appropriate) at the top of every public method that calls ChromaDB in `src/memory/memory-vault.ts`: `storeFixPattern`, `storeTestPattern`, `searchFixPatterns`, `searchTestPatterns`, `getStats`
- [ ] T012 [US3] Add public getter `isConnected(): boolean { return this.connected; }` to `MemoryVault` class in `src/memory/memory-vault.ts`
- [ ] T013 [US3] Write 4 unit tests in `tests/unit/memory/memory-vault-fallback.test.ts`:
  - Test 1: `initialize()` with unreachable ChromaDB (mock `getOrCreateCollection` to reject) → `isConnected()` returns false, no throw
  - Test 2: `storeFixPattern()` when `connected=false` → returns void, no throw, no ChromaDB call
  - Test 3: `searchFixPatterns()` when `connected=false` → returns empty array, no throw
  - Test 4: `initialize()` with timeout exceeded (mock resolves after >3s) → `isConnected()` returns false
- [ ] T014 [US3] Verify acceptance gate: run `npm test` and confirm all 269 original tests pass PLUS all 4 new fallback tests pass (total ≥ 273)

**Checkpoint**: MemoryVault degrades gracefully. Users without ChromaDB see one clear warning.

---

## Phase 5: User Story 4 — Actionable Error Messages (Priority: P4)

**Goal**: Each of the 5 targeted startup errors includes a `→ Fix:` line with an action the
developer can perform immediately. No new files; 2 existing files edited.

**Independent Test**: All error messages contain `→ Fix:`. `npm test` 269/269.

- [ ] T015 [P] [US4] Update the 3 API key error throws in `src/llm/provider-router.ts` (lines 221, 269, 336) to append `\n→ Fix: Set <ENV_VAR>=... in your .env file` with the correct env var name and URL for each provider — see `contracts/error-messages.md` for exact strings; do NOT echo key values
- [ ] T016 [P] [US4] Update the 2 tier config error throws in `src/lifecycle/tier-config.ts` (lines 41, 48) to append `\n→ Fix: ...` lines — line 41: suggest verifying path with cwd; line 48: suggest `cat file | jq .` — see `contracts/error-messages.md` for exact strings
- [ ] T017 [US4] Verify acceptance gate: run `npm test` 269/269 pass; optionally smoke-test one error path to confirm `→ Fix:` line appears in terminal output

**Checkpoint**: Developers hitting startup errors immediately know what to do.

---

## Phase 6: User Story 5 — API Reference Documentation (Priority: P5)

**Goal**: Create `docs/api/` with 5 markdown files covering all public CLI flags, config
schema, agent interfaces, and lifecycle exports. Minimum 300 lines total.

**Independent Test**: `ls docs/api/` shows 5 files; `wc -l docs/api/*.md` total ≥ 300; `npm test` 269/269.

- [ ] T018 [US5] Create `docs/api/` directory and write `docs/api/README.md` — include title "Micro Agent API Reference", a table of contents with one-sentence description per page linking to `cli.md`, `config.md`, `agents.md`, `lifecycle.md`, and a version note (v0.1.5)
- [ ] T019 [P] [US5] Write `docs/api/cli.md` — document all CLI flags for both `ma`/`micro-agent` and `ma-loop`/`ralph-loop run` entry points sourced from `src/cli/ralph-loop.ts`; required columns: Flag | Type | Default | Description | Example; must cover: `--file`, `--test`, `--simple [N]`, `--full`, `--no-escalate`, `--tier-config`, `--max-iterations`, `--budget`, `--verbose`, `--config`
- [ ] T020 [P] [US5] Write `docs/api/config.md` — document full `ralph.config.yaml` schema sourced from `src/config/schema-validator.ts` and `src/config/defaults.ts`; required columns: Key | Type | Default | Valid Values | Description; every field in the Zod schema must appear
- [ ] T021 [P] [US5] Write `docs/api/agents.md` — document all exported interfaces from `src/agents/base/agent-context.ts`: `AgentContext`, `LibrarianOutput`, `ArtisanOutput`, `CriticOutput`, `IterationState`, `BudgetConstraints`, `TestContext`, `FileContext`; required columns: Field | Type | Required | Description
- [ ] T022 [P] [US5] Write `docs/api/lifecycle.md` — document public exports from `src/lifecycle/`: `IterationManager` (constructor + public methods), `ContextMonitor` (`registerAgent`, `recordTokens`, 40% threshold), `SessionResetter` (constructor options, `reset()`), `TierEngine` (`runTier()` signature + return), `TierConfig`/`TierEscalationConfig` fields, `buildAccumulatedSummary()`, `withTierEscalationContext()`
- [ ] T023 [US5] Verify acceptance gate: confirm `docs/api/` contains exactly 5 `.md` files; run `wc -l docs/api/*.md` and confirm total ≥ 300 lines; run `npm test` 269/269

**Checkpoint**: All 5 outstanding issues resolved. Project is production-ready.

---

## Phase 7: Polish & Final Verification

**Purpose**: Run the complete acceptance suite across all 5 fixes together.

- [ ] T024 [P] Run final combined acceptance gate: `npx tsc --noEmit && npx prettier --check "**/*.ts" && npm test` — all three must succeed
- [ ] T025 [P] Confirm `docs/api/` has 5 files, `wc -l docs/api/*.md` total ≥ 300
- [ ] T026 Commit all changes with message: `fix: close all 5 outstanding issues — TS5 upgrade, prettierignore, ChromaDB fallback, error remediation, API docs`
- [ ] T027 Update memory-bank via memory-bank-keeper agent: record 004 complete, all issues resolved, test count (final), branch merged status

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — baseline validation
- **Phase 2 (Foundational / US1 TypeScript)**: Depends on Phase 1 — MUST complete before any acceptance gate
- **Phase 3 (US2 Prettier)**: Depends on Phase 2 (TS upgrade) — independent of US3/US4/US5
- **Phase 4 (US3 ChromaDB)**: Depends on Phase 2 — independent of US2/US4/US5
- **Phase 5 (US4 Error Messages)**: Depends on Phase 2 — independent of US2/US3/US5
- **Phase 6 (US5 API Docs)**: Depends on Phase 2 — independent of US2/US3/US4
- **Phase 7 (Polish)**: Depends on all phases complete

### User Story Dependencies (after Phase 2)

- **US2, US3, US4, US5**: All independent — can run in any order or in parallel

### Parallel Opportunities

- T015 and T016 are in different files — can be applied simultaneously
- T019, T020, T021, T022 (all `docs/api/*.md`) are completely independent files — run in parallel
- T024 and T025 (final verification) are independent checks — run together

---

## Parallel Example: Phase 6 (API Docs)

```bash
# All 4 doc files are independent — launch together:
Task: "Write docs/api/cli.md"        (T019)
Task: "Write docs/api/config.md"     (T020)
Task: "Write docs/api/agents.md"     (T021)
Task: "Write docs/api/lifecycle.md"  (T022)

# Error message edits — different files, launch together:
Task: "Update provider-router.ts error messages"  (T015)
Task: "Update tier-config.ts error messages"       (T016)
```

---

## Implementation Strategy

### MVP First (US1 — TypeScript upgrade only)

1. Complete Phase 1: Baseline validation
2. Complete Phase 2: TypeScript upgrade (T002–T006)
3. **STOP and VALIDATE**: `npx tsc --noEmit` exits 0, 269/269 pass
4. Continue with US2–US5 in priority order

### Incremental Delivery (recommended)

1. Phase 1 + 2 → TypeScript clean ✓
2. Phase 3 → Lint clean ✓
3. Phase 4 → ChromaDB safe offline ✓
4. Phase 5 → Error messages actionable ✓
5. Phase 6 → Docs complete ✓
6. Phase 7 → Final gate + commit

---

## Notes

- No new runtime dependencies in any phase
- 269 tests must pass after every phase — run `npm test` after each checkpoint
- API docs (US5) are independent of code changes — can be written while other fixes run
- T015/T016 (error messages) are in different files and can be applied simultaneously
- T019–T022 (doc pages) are fully parallel — 4 independent files
