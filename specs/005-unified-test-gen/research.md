# Research: Unified Test Generation for ma-loop

**Feature**: 005-unified-test-gen
**Date**: 2026-02-22

## Decision Log

### D001 — LLM Interface: ProviderRouter.complete() vs getSimpleCompletion()

**Decision**: Use `ProviderRouter.complete()` with `provider: 'anthropic'`

**Rationale**: `ProviderRouter` reads `ANTHROPIC_API_KEY` from environment variables (same as
the entire new `ma-loop` stack). `getSimpleCompletion()` reads from `~/.micro-agent` ini config
— a different configuration system used only by the legacy `ma` CLI. Using `ProviderRouter`
keeps test generation consistent with how Artisan, Librarian, and Critic all make LLM calls.

**Alternatives Considered**:
- `getSimpleCompletion()` — rejected: wrong config system, creates hidden dependency on legacy ini
- Direct Anthropic SDK — rejected: ProviderRouter already wraps it with cost tracking, error handling, and provider switching

**Reference**: `src/llm/provider-router.ts` lines 104-142 (`complete()` method signature)

---

### D002 — File Discovery: glob v10 (already installed)

**Decision**: Use `glob` v10 (`import { glob } from 'glob'`) already in `package.json`

**Rationale**: `glob` v10 is already a direct dependency (`"glob": "^10.4.1"`). It supports
async patterns, ignore lists, and absolute paths. No new dependency needed.

**Pattern for existing test discovery**:
```
{dir}/{basename}.{test,spec}.{ext}   # TypeScript/JavaScript
{dir}/test_{basename}.{ext}           # Python prefix convention
{dir}/{basename}_spec.{ext}           # Ruby spec convention
```

**Pattern for example test gathering**:
```
**/*.{test,spec}.{ts,js,py,rb}  (ignore: node_modules, dist, .git)
```

---

### D003 — File Writing: fs/promises (built-in)

**Decision**: Use `fs/promises.writeFile()` with `mkdir` recursive for directory creation

**Rationale**: Already used throughout the codebase (`import { promises as fs } from 'fs'` in
`src/parsers/framework-detector.ts`). `write-file-atomic` is NOT in package.json dependencies.
Plain `fs.promises.writeFile` is sufficient — generated test files are new files, not
concurrent-write scenarios where atomicity matters.

---

### D004 — Model for Generation: claude-sonnet-4-20250514 (same as Artisan)

**Decision**: Default to `claude-sonnet-4-20250514`, reusing `--artisan` model override flag

**Rationale**: Test generation is a code-generation task — the same model family as Artisan.
Reusing `--artisan` keeps the mental model consistent ("Artisan handles code, including tests")
and avoids introducing a new flag. Users who want a cheaper/faster model for generation can
use `--artisan claude-haiku-4-5-20251001`.

---

### D005 — Test Command Scoping per Framework

**Decision**: Scope the test command to the generated file by basename (no extension, no path)

| Framework | Scoped Command Pattern                          |
|-----------|------------------------------------------------|
| vitest    | `npx vitest run {basename}`                    |
| jest      | `npx jest {basename} --no-watch`               |
| pytest    | `pytest {relativeTestFilePath}`                |
| mocha     | `npx mocha {testFilePath}`                     |
| rspec     | `bundle exec rspec {testFilePath}`             |
| cargo     | `npm test` (fallback — Cargo can't scope by file) |
| custom    | `npm test` (fallback)                          |

**Rationale**: Running the full test suite (273 tests) on every iteration would be very slow
and would show failures unrelated to the generated test. Scoping ensures fast feedback loops.

**Vitest/Jest**: Use basename without extension so test runner pattern-matches the file name.
**pytest**: Use relative file path — pytest accepts file arguments directly.
**RSpec**: Use file path — RSpec accepts file arguments directly.

---

### D006 — Rust Skip: Unconditional

**Decision**: For `.rs` files, skip generation entirely and log an explanation

**Rationale**: Rust tests live in the same file as the source code (`#[cfg(test)] mod tests {...}`).
An external test file (e.g., `tests/math_test.rs`) requires `Cargo.toml` module declarations
that cannot be auto-generated without knowing the crate structure. Auto-generating a broken
Rust test file is worse than skipping.

---

### D007 — Dynamic Import in run.ts

**Decision**: Use `await import('../../helpers/test-generator')` (dynamic import)

**Rationale**: Matches the established pattern used in `runSimpleIteration()` which does
`await import('../../testing/test-runner')`. Dynamic import prevents circular dependency risk
and keeps the import lazy (no cost if `--no-generate` or `--test` is used).

---

### D008 — Integration Point in run.ts

**Decision**: Insert generation after `prepareRunParameters()` returns (line ~111), BEFORE
`initializeInfrastructure()` (line ~113)

**Rationale**: `prepareRunParameters()` already detects the framework (needed for scoped
command). Infrastructure (ProviderRouter, CostTracker) is initialized after — so the
generation step runs before agents are set up. This keeps the generation isolated from the
iteration loop.

**Skip conditions** (all must be checked before invoking generation):
1. `!params.targetFile` — objective-only mode (no file to analyze)
2. `options.generate === false` — `--no-generate` passed (Commander sets `false` for `--no-*`)
3. `options.test` is set — user explicitly provided test command

---

## No NEEDS CLARIFICATION Markers Remain

All decisions resolved from codebase analysis + plan context.
