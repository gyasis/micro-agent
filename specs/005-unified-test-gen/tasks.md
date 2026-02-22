# Tasks: Unified Test Generation for ma-loop (005)

**Branch**: `005-unified-test-gen`
**Input**: Design documents from `/specs/005-unified-test-gen/`
**Total Tasks**: 26
**Tests**: Included — spec AC7/AC8 require regression gate + unit coverage for new module

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete sibling tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)

---

## Phase 1: Setup

**Purpose**: Confirm baseline state before making any changes.

- [x] T001 Confirm active branch is `005-unified-test-gen` and `npm test` reports 273/273 passing before any changes (baseline validation)

---

## Phase 2: Foundational — Internal Helpers (No Exported Side Effects)

**Purpose**: Create `src/helpers/test-generator.ts` with all pure internal helper functions.
These helpers are NOT exported — they are the building blocks for US1–US5.
This phase MUST complete before any user story integration begins.

**⚠️ CRITICAL**: All user story phases depend on this file existing.

**Independent Test**: `npx tsc --noEmit` exits 0; `npm test` 273/273 pass (no regressions from new file alone).

- [x] T002 Create `src/helpers/test-generator.ts` with module docblock, imports (`path`, `fs/promises`, `glob`, `ProviderRouter`, `Message`), and export the two interface stubs (`TestGeneratorOptions`, `TestGeneratorResult`) — no function bodies yet
- [x] T003 Implement `resolveTestFilePath(targetFile: string, framework: string): string | null` (NOT exported) in `src/helpers/test-generator.ts` — maps `.ts`→`.test.ts`, `.js`→`.test.js`, `.py`→`test_{name}.py`, `.rs`→`null`, `.rb`→`{name}_spec.rb`, other→`.test.{ext}`, all in same directory as target
- [x] T004 Implement `extractCodeBlock(raw: string): string` (NOT exported) in `src/helpers/test-generator.ts` — finds first ` ``` ` fence, skips optional language specifier line, reads until closing ` ``` `, returns trimmed content; returns `raw.trim()` if no fence found
- [x] T005 Implement `buildTestCommand(testFilePath: string, framework: string): string` (NOT exported) in `src/helpers/test-generator.ts` — vitest→`npx vitest run {basename-no-ext}`, jest→`npx jest {basename-no-ext} --no-watch`, pytest→`pytest {relativeTestFilePath}`, mocha→`npx mocha {testFilePath}`, rspec→`bundle exec rspec {testFilePath}`, cargo/custom→`npm test` fallback
- [x] T006 Implement `gatherExampleTests(workingDir: string): Promise<string[]>` (NOT exported) in `src/helpers/test-generator.ts` — globs `**/*.{test,spec}.{ts,js,py,rb}` ignoring `node_modules`, `dist`, `.git`; reads up to 2 files; returns array of content strings
- [x] T007 Implement `buildGenerationMessages(targetFile, targetContent, objective, testFilePath, exampleTests, packageJson): Message[]` (NOT exported) in `src/helpers/test-generator.ts` — returns `[systemMsg, userMsg]` per the prompt design in `contracts/test-generator-api.md`; includes `<examples>` block if examples exist, else `<package-json>` block if packageJson non-empty
- [x] T008 Verify foundational checkpoint: run `npx tsc --noEmit` (0 errors) and `npm test` (273/273 pass) — do NOT proceed to user story phases until both pass

**Checkpoint**: Internal helpers exist and compile. User story phases can now begin.

---

## Phase 3: User Story 1 — Auto Test Generation (Priority: P1) 🎯 MVP

**Goal**: When no test file exists and no overriding flags are set, `ma-loop run <file>` generates
a test file via Claude Sonnet before the loop starts and scopes the test command to that file.

**Independent Test**: `npx ralph-loop run /tmp/math.ts --objective "implement multiply"` with
no `/tmp/math.test.ts` → test file is created, loop runs, logs show "Generated:".
Run `npm test` and confirm 273+ pass.

### Unit Tests for US1 (write these first, they should fail until T012 is done)

- [x] T009 [US1] Write unit test group `describe('generateTestFile')` in `tests/unit/helpers/test-generator.test.ts` — 9 cases: router.complete() called with `provider: 'anthropic'`; default model is `claude-sonnet-4-20250514`; model override honored when `options.model` set; `fs.writeFile` called with resolved path and extracted code; returns correct `testCommand` for vitest; returns correct `testCommand` for pytest; throws when `.rs` target resolved (null path); includes up to 2 example contents in messages when available; falls back to package.json block when no examples

### Implementation for US1

- [x] T010 [US1] Implement `findExistingTests(targetFile: string, workingDir: string): Promise<string | null>` (EXPORTED) in `src/helpers/test-generator.ts` — resolves absolute path, checks for `.test.{ext}`, `.spec.{ext}`, `test_{name}.{ext}`, `{name}_spec.{ext}` patterns in same directory; returns found path or null; `.rs` files always return null
- [x] T011 [US1] Implement `generateTestFile(options: TestGeneratorOptions): Promise<TestGeneratorResult>` (EXPORTED) in `src/helpers/test-generator.ts` — calls `resolveTestFilePath` (throws if null), reads source file, calls `gatherExampleTests`, reads `package.json`, calls `buildGenerationMessages`, calls `new ProviderRouter().complete({provider:'anthropic', model, messages, temperature:0.7, maxTokens:4096})`, extracts code block, writes file, returns result with `buildTestCommand` output
- [x] T012 [US1] Add `generate?: boolean` field to `RunOptions` interface in `src/cli/commands/run.ts` (after `tierConfig?: string` field, line ~79)
- [x] T013 [US1] Insert generation block in `src/cli/commands/run.ts` after `prepareRunParameters()` call (~line 111) and BEFORE `initializeInfrastructure()` call (~line 113) — dynamic import `test-generator`, call `findExistingTests`, branch on result: if null and not `.rs` call `generateTestFile` and update `params.testCommand`, else log "Using existing tests:", wrap generate call in try/catch to warn-and-continue on LLM failure
- [x] T014 [US1] Verify US1 acceptance gate: run `npm test` (273+ pass), `npx tsc --noEmit` (0 errors), smoke test `quickstart.md Test 1` (test file created and loop runs)

**Checkpoint**: US1 complete — `ma-loop` can now auto-generate tests for greenfield files.

---

## Phase 4: User Story 2 — Existing Tests Passthrough (Priority: P2)

**Goal**: When a test file already exists adjacent to the source file, generation is skipped
entirely and the loop proceeds with the found test file. Zero new files are written.

**Independent Test**: `npx ralph-loop run src/helpers/llm.ts --objective "add streaming"` →
logs "Using existing tests: src/helpers/llm.test.ts", no new file written. `npm test` 273+ pass.

### Unit Tests for US2

- [x] T015 [US2] Add unit test group `describe('findExistingTests')` in `tests/unit/helpers/test-generator.test.ts` — 5 cases: returns null when no `.test.ts` file exists; returns path when `foo.test.ts` exists adjacent; returns path when `foo.spec.ts` exists adjacent; always returns null for `.rs` files; returns path for `test_foo.py` prefix convention (Python)

### Implementation for US2

- [x] T016 [US2] Confirm `findExistingTests()` (implemented in T010) correctly handles all passthrough patterns — no new code needed; verify via unit tests from T015 that all 5 patterns pass
- [x] T017 [US2] Verify US2 acceptance gate: run `npm test` (273+ pass), smoke test `quickstart.md Test 2` (logs "Using existing tests:", NO new file written)

**Checkpoint**: US2 complete — existing test work is never overwritten.

---

## Phase 5: User Story 3 — Opt-out via --no-generate (Priority: P3)

**Goal**: When the user passes `--no-generate`, test generation is skipped unconditionally.
The flag is visible in `--help` output.

**Independent Test**: `npx ralph-loop run /tmp/add.ts --no-generate --test "echo mock"` →
no `/tmp/add.test.ts` created; `ralph-loop run --help` shows `--no-generate` option.
Run `npm test` 273+ pass.

### Implementation for US3

- [x] T018 [US3] Add `--no-generate` option to the `run` command in `src/cli/ralph-loop.ts` after the existing `--tier-config` option (~line 84): `.option('--no-generate', 'Skip automatic test file generation when no test file exists')`
- [x] T019 [US3] Update `run` command description in `src/cli/ralph-loop.ts` line 35 from `'Run Ralph Loop iterations for a file or objective'` to `'Run Ralph Loop iterations for a file or objective (auto-generates tests if none exist)'`
- [x] T020 [US3] Verify US3 acceptance gate: run `npx ralph-loop run --help` and confirm `--no-generate` appears; run `npm test` (273+ pass); smoke test `quickstart.md Test 3` (no file generated with `--no-generate`)

**Checkpoint**: US3 complete — power users can always opt out of auto-generation.

---

## Phase 6: User Story 4 — Explicit Test Command Skips Generation (Priority: P4)

**Goal**: When `--test <command>` is explicitly passed, generation is skipped because the user
has already provided their test strategy.

**Independent Test**: `npx ralph-loop run /tmp/math.ts --test "npx vitest run /tmp/math"` →
no generation attempt, provided command used. `npm test` 273+ pass.

### Implementation for US4

- [x] T021 [US4] Confirm the `!options.test` guard in the generation block (inserted in T013) correctly skips generation when `--test` is provided — no new code needed; verify by reading the block and smoke-testing `quickstart.md Test 4`
- [x] T022 [US4] Verify US4 acceptance gate: smoke test `quickstart.md Test 4` (generation skipped when `--test` provided); run `npm test` (273+ pass)

**Checkpoint**: US4 complete — explicit test commands are always respected.

---

## Phase 7: User Story 5 — Language-Aware Test Naming (Priority: P5)

**Goal**: Test files are named according to the target language convention. Rust targets are
always skipped. All other languages produce correctly-named files.

**Independent Test**: Run generation against `.ts`, `.js`, `.py`, `.rb` files — each produces
the correct name. Run against `.rs` — no file created, clear log. `npm test` 273+ pass.

### Unit Tests for US5

- [x] T023 [US5] Add unit test group `describe('resolveTestFilePath')` in `tests/unit/helpers/test-generator.test.ts` — 6 cases: `.ts`→`.test.ts` in same dir; `.js`→`.test.js` in same dir; `.py`→`test_{name}.py` in same dir; `.rs`→`null`; `.rb`→`{name}_spec.rb` in same dir; nested path `src/util/math.ts`→`src/util/math.test.ts`

### Implementation for US5

- [x] T024 [US5] Confirm `resolveTestFilePath()` (implemented in T003) handles all 6 cases — no new code needed; verify via unit tests from T023 that all cases pass
- [x] T025 [US5] Verify US5 acceptance gate: run `npm test` (273+ pass), `npx tsc --noEmit` (0 errors); smoke tests `quickstart.md Test 5` (Rust skipped) and `quickstart.md Test 6` (Python `test_math.py` naming)

**Checkpoint**: US5 complete — all language conventions are correctly handled.

---

## Phase 8: Polish & Final Verification

**Purpose**: Run the complete acceptance suite across all 5 user stories.

- [x] T026 [P] Add unit test group `describe('extractCodeBlock')` in `tests/unit/helpers/test-generator.test.ts` — 4 cases: extracts from ` ```typescript ``` ` fence; extracts from ` ```python ``` ` fence; returns raw string when no fence present; handles ` ``` ` without language specifier
- [x] T027 Run full combined acceptance gate: `npm test` (all 273 original + all new unit tests pass), `npx tsc --noEmit` (0 errors) — MUST pass before proceeding
- [x] T028 Commit all changes: `feat: add unified test generation for ma-loop — auto-generates tests when none exist`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — baseline validation
- **Phase 2 (Foundational)**: Depends on Phase 1 — creates internal helpers; BLOCKS all US phases
- **Phase 3 (US1)**: Depends on Phase 2 — core generation + CLI integration
- **Phase 4 (US2)**: Depends on Phase 3 (T010 findExistingTests must exist) — passthrough tests
- **Phase 5 (US3)**: Depends on Phase 3 (generation block must exist) — flag + skip logic
- **Phase 6 (US4)**: Depends on Phase 3 (generation block must exist) — verify existing guard
- **Phase 7 (US5)**: Depends on Phase 2 (T003 resolveTestFilePath must exist) — language tests
- **Phase 8 (Polish)**: Depends on all phases complete

### Parallel Opportunities After Phase 2

Once Phase 2 (Foundational) is complete:
- **US2 (Phase 4)** and **US5 unit tests (T023)** are independent of US3/US4 — can run in parallel
- **US3 (Phase 5)** and **US4 (Phase 6)** are in different files — can run in parallel
- **T009 unit tests** and **T010-T011 implementation** in US1 — tests first, then implementation

### Within-Phase Parallel

- T003, T004, T005 (Foundational helpers) are all in the same file — sequential
- T009 (unit tests) can be written while T010-T011 are being implemented (TDD)
- T018 and T019 are in the same file (ralph-loop.ts) — sequential
- T026, T027 (Polish) are independent — can run in parallel

---

## Parallel Execution Examples

```bash
# Phase 3 — TDD order:
Task: "Write generateTestFile unit tests (T009)"      # write tests first
Task: "Implement findExistingTests (T010)"            # can start in parallel
# → Then implement generateTestFile (T011) once T009 tests are written

# Phase 5 + Phase 6 — different files, run together:
Task: "Add --no-generate to ralph-loop.ts (T018, T019)"    # ralph-loop.ts
Task: "Verify --test guard in run.ts (T021)"               # read-only check

# Phase 7 unit tests + Phase 4 unit tests — both in test file, but independent groups:
Task: "Write resolveTestFilePath tests (T023)"         # describe block 1
Task: "Write findExistingTests tests (T015)"           # describe block 2
```

---

## Implementation Strategy

### MVP First (US1 only — Phase 1 + 2 + 3)

1. Phase 1: Baseline validation
2. Phase 2: Build internal helpers (foundational)
3. Phase 3: Implement + integrate generateTestFile + findExistingTests
4. **STOP and VALIDATE**: `npm test` 273+ pass, smoke test creates `/tmp/math.test.ts`
5. Feature is usable — continue with US2–US5 for completeness

### Incremental Delivery (recommended)

1. Phase 1 + 2 → helpers compile, no regressions
2. Phase 3 (US1) → auto-generation works end-to-end ✓ MVP
3. Phase 4 (US2) → passthrough confirmed safe ✓
4. Phase 5 (US3) → opt-out flag working ✓
5. Phase 6 (US4) → explicit command respected ✓
6. Phase 7 (US5) → language naming verified ✓
7. Phase 8 → final gate + commit ✓

---

## Notes

- No new npm dependencies — uses `glob` (already installed), `fs/promises` (built-in), `ProviderRouter` (existing)
- 273 tests must pass after every phase — run `npm test` at each checkpoint
- `resolveTestFilePath` and `buildTestCommand` are the critical helpers — all US depend on them
- Dynamic import in run.ts matches existing pattern from `runSimpleIteration` — no circular risk
- Generation is wrapped in try/catch — LLM failure is a warning, not a fatal error
- T009, T015, T023, T026 (all unit tests) target separate `describe` blocks in the same file — write as you go
