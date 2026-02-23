# Feature Specification: Close All Outstanding Issues for Production Readiness

**Feature Branch**: `004-fix-outstanding-issues`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "Fix all 5 outstanding issues before the project is considered complete"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Clean Typecheck (Priority: P1)

A contributor runs `npx tsc --noEmit` and sees zero errors. Currently TypeScript 4.9.5 is
installed but Zod v4 requires TypeScript 5+ (Zod v4 uses `const` type parameters, a TS5
language feature). This produces hundreds of spurious errors. Additionally `summary-reporter.ts`
has a real destructuring syntax bug (`as` keyword used where `:` is required in line 311).

**Why this priority**: Broken typecheck is a red flag on every CI run and blocks contributors
from trusting the toolchain. Fastest to fix and unlocks confidence in all other checks.

**Independent Test**: Run `npx tsc --noEmit` — exit code 0, zero output. Run `npm test` —
269/269 pass. Delivers a trustworthy CI typecheck gate.

**Acceptance Scenarios**:

1. **Given** the project is checked out, **When** `npx tsc --noEmit` is run, **Then** output is
   empty and exit code is 0
2. **Given** TypeScript is upgraded, **When** all 269 tests run, **Then** all 269 still pass
3. **Given** `summary-reporter.ts:311` uses `{ promises as fs }`, **When** corrected to
   `{ promises: fs }`, **Then** the two TS1005 errors at that line disappear

---

### User Story 2 — Silent Lint (Priority: P2)

A contributor runs `npx prettier --check "**/*.ts"` and sees zero warnings. Currently 114 files
produce `[warn]` output because `.prettierignore` only covers 3 patterns. Generated directories
(`dist/`, `node_modules/`, `specs/`, `scripts/`, `coverage/`, `.micro-agent/`) all trigger
warnings on every lint pass.

**Why this priority**: 114 lint warnings drown out real issues and erode the signal value of
the lint step. Quick to fix with no risk.

**Independent Test**: Run `npx prettier --check "**/*.ts"` — exit code 0, zero `[warn]` lines.
Run `npm test` — 269/269 pass.

**Acceptance Scenarios**:

1. **Given** `.prettierignore` is updated, **When** `npx prettier --check "**/*.ts"` runs,
   **Then** output is `All matched files use Prettier code style!` with exit code 0
2. **Given** source files in `src/` are correctly formatted, **When** prettier runs on them,
   **Then** they are not flagged (real source is not accidentally ignored)

---

### User Story 3 — Offline-Safe Memory Vault (Priority: P3)

A developer runs `ralph-loop run` on a machine where ChromaDB is not running at `localhost:8000`.
Currently the MemoryVault will throw unhandled connection errors at runtime. The system should
detect the unreachable ChromaDB instance, fall back to a no-op in-memory mode, and log one
clear advisory message.

**Why this priority**: ChromaDB is an optional external service. Users without it running
locally should not see crashes. Existing behavior when ChromaDB IS present is unchanged.

**Independent Test**: Run `ralph-loop run` with no ChromaDB process. Confirm single advisory
warning, no crash, and tool continues. Run `npm test` — 269/269 pass.

**Acceptance Scenarios**:

1. **Given** ChromaDB is not reachable, **When** MemoryVault initializes, **Then** the system
   logs `[MemoryVault] ChromaDB unavailable — running in no-op mode` and continues
2. **Given** ChromaDB is not reachable, **When** any MemoryVault store/retrieve call is made,
   **Then** it returns empty results with no crash or throw
3. **Given** ChromaDB IS reachable, **When** MemoryVault initializes, **Then** it connects
   normally with no warning (existing behavior preserved)

---

### User Story 4 — Actionable Error Messages (Priority: P4)

A developer encounters a startup error (missing API key, bad config file, missing tier config
path) and sees a message with a clear remediation step. Currently key error paths print only
the raw error without telling the user what to do next. Scope: top 5 most common error points.

**Why this priority**: Improves developer onboarding and reduces support friction. Low risk,
narrow scope.

**Independent Test**: Trigger each of the 5 targeted error conditions and verify each message
includes a `→ Fix:` action line. Run `npm test` — 269/269 pass.

**Acceptance Scenarios**:

1. **Given** `ANTHROPIC_API_KEY` is absent, **When** the CLI starts, **Then** error output
   includes both the problem and "→ Fix: Add ANTHROPIC_API_KEY=... to your .env"
2. **Given** `--tier-config path/to/missing.json` is provided, **When** CLI starts, **Then**
   error includes the bad path and "→ Fix: Verify the file exists at that path"
3. **Given** a tier config file contains invalid JSON, **When** CLI starts, **Then** error
   includes the parse error and "→ Fix: Validate your JSON with a linter"

---

### User Story 5 — API Reference Documentation (Priority: P5)

A developer integrating the ralph-loop programmatic API reads `docs/api/` and finds a complete
reference covering CLI commands, configuration schema, agent interfaces, and the lifecycle API.
Currently `docs/api/` does not exist.

**Why this priority**: Needed for project completeness and contributor onboarding but does not
affect runtime behaviour. Done last.

**Independent Test**: Open `docs/api/README.md` and navigate to documentation for each of:
CLI commands, config schema, AgentContext, and the tier escalation API.

**Acceptance Scenarios**:

1. **Given** `docs/api/` is created, **When** a developer opens `docs/api/README.md`, **Then**
   they find a table of contents linking to `cli.md`, `config.md`, `agents.md`, `lifecycle.md`
2. **Given** `docs/api/cli.md` exists, **When** a developer reads it, **Then** all CLI flags
   (`--simple`, `--full`, `--no-escalate`, `--tier-config`) are documented with type and example
3. **Given** `docs/api/config.md` exists, **When** a developer reads it, **Then** the full
   `ralph.config.yaml` schema is documented with defaults and valid values

---

### Edge Cases

- TypeScript upgrade may surface new type errors in `src/`; all must be fixed before
  the typecheck gate is considered clean
- `.prettierignore` additions must not accidentally exclude files under `src/`
- ChromaDB fallback must not silently swallow connection errors indefinitely — log once clearly
- Error message remediation steps must not expose secret values (e.g., do not echo the API key)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `npx tsc --noEmit` MUST exit with code 0 and produce no output after TypeScript
  is upgraded to ^5.x and `summary-reporter.ts:311` destructuring syntax is corrected
- **FR-002**: TypeScript upgrade MUST NOT break any of the 269 existing passing tests
- **FR-003**: `npx prettier --check "**/*.ts"` MUST exit with code 0 after `.prettierignore`
  is updated with all generated/vendor directories
- **FR-004**: `.prettierignore` updates MUST NOT exclude any files under `src/`
- **FR-005**: MemoryVault MUST attempt a ChromaDB connection on init with a timeout of ≤ 2s
  and fall back to no-op mode if the connection fails or times out
- **FR-006**: MemoryVault no-op mode MUST log exactly one advisory-level message then operate
  silently (no repeated warnings per subsequent call)
- **FR-007**: MemoryVault MUST preserve full existing behavior when ChromaDB is reachable
- **FR-008**: The following 5 error paths MUST include a `→ Fix:` remediation line:
  missing ANTHROPIC_API_KEY, missing GOOGLE_API_KEY, missing OPENAI_API_KEY,
  `--tier-config` file not found, tier config JSON parse failure
- **FR-009**: `docs/api/` MUST contain: `README.md` (index), `cli.md`, `config.md`,
  `agents.md`, `lifecycle.md`
- **FR-010**: Each `docs/api/` page MUST cover all public-facing items in its domain

### Key Entities

- **TypeScript Compiler**: The `tsc` binary — upgrading from 4.9.5 to ^5.x
- **`.prettierignore`**: File listing paths excluded from Prettier formatting checks
- **MemoryVault**: `src/memory/memory-vault.ts` — ChromaDB-backed vector store with no-op fallback
- **Error Path**: A location in CLI startup or config loading that emits a terminal error
- **API Docs**: Markdown reference files under `docs/api/`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `npx tsc --noEmit` exits code 0 with zero lines of output (down from 500+ errors)
- **SC-002**: `npx prettier --check "**/*.ts"` exits code 0 with zero `[warn]` lines (down from 114)
- **SC-003**: All 269 tests pass after every individual change — zero regressions
- **SC-004**: Running `ralph-loop run` with no ChromaDB service produces exactly one
  `[MemoryVault]` advisory line and continues to run
- **SC-005**: Each of the 5 targeted error messages includes a `→ Fix:` line a developer
  can act on without consulting additional documentation
- **SC-006**: `docs/api/` contains 5 markdown files covering all public CLI flags, config
  fields, agent interfaces, and lifecycle exports

## Assumptions

- TypeScript 5.x is backward-compatible with existing `src/` code; any new type errors
  surfaced by the upgrade will be fixed as part of FR-001
- `moduleResolution: "node"` remains valid after the TS upgrade; if not, updated to `"node16"`
  as needed to maintain passing tests
- The 5 error paths in FR-008 cover the most common onboarding failures; exhaustive coverage
  of all error paths is out of scope
- ChromaDB offline fallback does not require a new dependency — uses a lightweight TCP probe
  or connect attempt with timeout using existing `chromadb` client API
- API docs are authored by hand from source code (no automated doc-gen tooling introduced)
