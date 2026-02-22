# Feature Specification: Unified Test Generation for ma-loop

**Feature Branch**: `005-unified-test-gen`
**Created**: 2026-02-22
**Status**: Draft
**Input**: User description: "Auto-generate test files for ma-loop when none exist before iterations begin"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Auto Test Generation (Priority: P1)

A developer runs `ma-loop run src/math.ts` on a file with no companion test file. Instead of
failing silently or producing empty results, the tool automatically generates a comprehensive
test file for that source file before the iteration loop begins. The developer does not need
to write any tests manually — the tool handles it end-to-end.

**Why this priority**: Without this, `ma-loop` is unusable for greenfield files. This is the
primary gap between `ma` (original CLI) and `ma-loop`. Delivering this story alone gives users
the core value of the feature.

**Independent Test**: Point `ma-loop run` at a file with no test companion. Confirm a test
file appears on disk and the iteration loop uses it — no manual intervention required.

**Acceptance Scenarios**:

1. **Given** a source file `src/math.ts` exists with no `math.test.ts` alongside it,
   **When** the user runs `ma-loop run src/math.ts`,
   **Then** a `math.test.ts` file is created in the same directory before iterations start
2. **Given** a test file was auto-generated,
   **When** the iteration loop begins,
   **Then** only that generated test file is run (not the full project test suite)
3. **Given** the tool is generating a test,
   **When** it searches for style examples,
   **Then** it uses up to 2 existing test files from the project as style guides
4. **Given** no example test files exist in the project,
   **When** generating a test,
   **Then** the tool falls back to using the project's dependency manifest for context

---

### User Story 2 — Existing Tests Passthrough (Priority: P2)

A developer runs `ma-loop run src/helpers/llm.ts` where `llm.test.ts` already exists. The
tool detects the existing test file and skips generation entirely. The loop proceeds using the
found test file. No LLM call is made for test generation.

**Why this priority**: Safety-first — the tool must never clobber existing test work. This
also covers the majority of day-to-day `ma-loop` usage where tests already exist.

**Independent Test**: Run `ma-loop run` on a file with an adjacent test file. Confirm the log
shows "Using existing tests:" and no new test file is written.

**Acceptance Scenarios**:

1. **Given** `src/helpers/llm.ts` and `src/helpers/llm.test.ts` both exist,
   **When** the user runs `ma-loop run src/helpers/llm.ts`,
   **Then** the tool logs "Using existing tests: src/helpers/llm.test.ts" and does NOT write any new file
2. **Given** a `.spec.ts` variant exists (e.g., `math.spec.ts`) instead of `.test.ts`,
   **When** `ma-loop run src/math.ts` is invoked,
   **Then** the spec file is detected and generation is skipped
3. **Given** an existing test is found,
   **When** the loop runs,
   **Then** the test command is NOT narrowed (the original detected command is preserved)

---

### User Story 3 — Opt-out Flag (Priority: P3)

A developer who wants full control over test generation passes `--no-generate` to the run
command. Test generation is skipped unconditionally — even if no test file exists. The loop
proceeds as before with whatever test command was configured.

**Why this priority**: Power users must be able to opt out. Forced automation is friction for
users who have custom test setups not discoverable by the tool.

**Independent Test**: Run `ma-loop run <file> --no-generate` against a file with no tests.
Confirm no test file is created and the loop proceeds with the existing test command.

**Acceptance Scenarios**:

1. **Given** no test file exists for the target,
   **When** the user runs `ma-loop run src/math.ts --no-generate`,
   **Then** no test file is generated and the loop starts with the configured test command
2. **Given** `--no-generate` is passed,
   **When** `ralph-loop run --help` is displayed,
   **Then** `--no-generate` appears in the options list with a clear description

---

### User Story 4 — Explicit Test Command Skips Generation (Priority: P4)

A developer passes `--test "npm run test:unit"` explicitly. The tool interprets this as the
user taking control of the test command and skips test generation entirely.

**Why this priority**: When the user specifies exactly which tests to run, they have already
decided on their test strategy. Generating a file they won't use is waste and potential
confusion.

**Independent Test**: Run `ma-loop run <file> --test "npm test"` against a file with no tests.
Confirm no generation happens.

**Acceptance Scenarios**:

1. **Given** no test file exists,
   **When** the user passes `--test "npm run test:unit"`,
   **Then** no test file is generated and the provided command is used as-is

---

### User Story 5 — Language-Aware Test Naming (Priority: P5)

The tool generates test files with names that follow the convention of the target language.
TypeScript and JavaScript files get `.test.{ext}` suffixes. Python files get `test_` prefixes.
Rust files are skipped entirely (Rust uses inline tests — external files require manual module
wiring).

**Why this priority**: Correct naming ensures the generated test is picked up by the project's
test runner without extra configuration. Wrong names break discovery silently.

**Independent Test**: Run generation against a `.py`, `.ts`, `.js`, and `.rb` file. Confirm
each produces a test file with the correct language-convention name. Run against a `.rs` file
and confirm no file is generated.

**Acceptance Scenarios**:

1. **Given** target is `src/math.ts`, **When** generation runs, **Then** `src/math.test.ts` is created
2. **Given** target is `utils/helpers.js`, **When** generation runs, **Then** `utils/helpers.test.js` is created
3. **Given** target is `services/auth.py`, **When** generation runs, **Then** `services/test_auth.py` is created
4. **Given** target is `src/lib.rs`, **When** `ma-loop run src/lib.rs` is invoked, **Then** generation is skipped and a clear log message explains why
5. **Given** target is `app/user.rb`, **When** generation runs, **Then** `app/user_spec.rb` is created

---

### Edge Cases

- What happens when the target file is in a read-only directory? → Tool should log a clear
  error and exit gracefully rather than crashing
- What happens when the target is an objective string (no file), not a file path? → Generation
  is skipped (no file to analyze)
- What happens when the LLM returns an empty or malformed response? → Tool logs a warning and
  proceeds without a test file (does not block the loop)
- What happens when a generated test file fails to parse by the test runner? → The loop still
  runs; failure is treated the same as a normal test failure
- What if the `--artisan` model override is set? → That model is used for generation instead
  of the default
- What if both `--test` and no test file exist? → `--test` wins; generation is skipped

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST check for an existing test file before invoking any LLM for generation
- **FR-002**: If no test file exists AND `--test` is not provided AND `--no-generate` is not set,
  the tool MUST auto-generate a test file using an AI model before the iteration loop begins
- **FR-003**: Generated test files MUST follow the naming convention of the target file's language
  (`.test.ts` for TypeScript, `.test.js` for JavaScript, `test_*.py` for Python, `*_spec.rb` for Ruby)
- **FR-004**: For Rust (`.rs`) targets, the tool MUST skip generation and log an explanatory message
- **FR-005**: After generation, the test command MUST be scoped to run only the generated test file
  (not the full project test suite)
- **FR-006**: When `--no-generate` flag is passed, the tool MUST skip generation unconditionally
- **FR-007**: When `--test <command>` is explicitly provided, the tool MUST skip generation
- **FR-008**: The `--no-generate` flag MUST appear in the CLI help output with a clear description
- **FR-009**: When an existing test file is found, the tool MUST log the path of the found file
  and proceed without generating
- **FR-010**: The tool MUST use up to 2 example test files from the project to guide generation style
- **FR-011**: When no example test files exist, the tool MUST fall back to the project's dependency
  manifest for context clues on the testing library in use
- **FR-012**: All 273 existing tests MUST continue to pass after this feature is added (zero regressions)

### Key Entities

- **Target File**: The source file passed to `ma-loop run` — determines test file naming convention
  and provides source content for the generation prompt
- **Test File**: The companion test file — either found on disk or generated by the AI model before
  the loop starts
- **Generation Result**: The outcome of the auto-generation step — includes the test file path and
  the scoped test command to use for the loop
- **Example Tests**: Up to 2 existing test files from the project used as style guides in the
  generation prompt

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running `ma-loop run` against a file with no tests produces a test file on disk
  within the pre-loop setup phase — zero manual steps required from the developer
- **SC-002**: Running `ma-loop run` against a file with existing tests logs "Using existing tests:"
  and writes zero new files — existing work is always preserved
- **SC-003**: Passing `--no-generate` or `--test` completely bypasses the generation step —
  100% of invocations with these flags skip generation
- **SC-004**: Generated test file names are correct for the target language in 100% of cases
  across TypeScript, JavaScript, Python, and Ruby
- **SC-005**: Rust targets skip generation 100% of the time with a logged explanation
- **SC-006**: All 273 pre-existing tests continue to pass after the feature ships — zero regressions
- **SC-007**: The iteration test command after generation is scoped to the generated file,
  not the full suite — individual test runs are faster and more focused

## Assumptions

- The project's dependency manifest (package.json, pyproject.toml, etc.) is readable from the
  working directory; if not, the prompt falls back gracefully with no context
- Example test discovery uses simple file-pattern glob — does not require an index or registry
- The AI model used for generation has sufficient context from source file + examples to produce
  a runnable (if imperfect) test; the iteration loop is expected to fix any failures
- Rust is the only language where external test file generation is explicitly skipped; other
  less-common languages receive a best-effort `.test.{ext}` file
- The `--artisan` model flag naturally extends to generation; no new flag is introduced
- "Scoped test command" means a command targeting only the generated file by name (not path glob),
  e.g., `npx vitest run math` rather than `npm test`
- Objective-only invocations (where `target` is a description string, not a file path) are
  out of scope for this feature — generation only applies when a file path is given
