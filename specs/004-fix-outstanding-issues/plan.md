# Implementation Plan: Fix All Outstanding Issues

**Branch**: `004-fix-outstanding-issues` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-fix-outstanding-issues/spec.md`

## Summary

Fix 5 outstanding issues that block production-readiness: TypeScript 4→5 upgrade (resolves
500+ spurious typecheck errors), comprehensive `.prettierignore` (eliminates 114 lint warnings),
ChromaDB offline fallback (graceful degradation without crash), remediation steps in 5 key
error messages, and `docs/api/` reference documentation. All 269 existing tests must continue
to pass after every change.

## Technical Context

**Language/Version**: TypeScript (upgrading from 4.9.5 → 5.9.3), Node.js 18+
**Primary Dependencies**: zod ^3.x, chromadb, better-sqlite3, xstate v5, commander
**Storage**: SQLite (audit log, best-effort), ChromaDB (optional vector store)
**Testing**: Vitest — `npm test` runs 269 tests; all must pass after every change
**Target Platform**: Linux/macOS CLI tool, Node.js 18+
**Project Type**: Single project — CLI tool with `src/` source, `tests/` tests
**Performance Goals**: TypeScript compilation must complete in <30s; test suite in <10s
**Constraints**: Zero new runtime dependencies; no changes to public CLI API surface;
269 tests pass after each independent fix
**Scale/Scope**: 5 isolated fixes, each independently releasable; ~15 files touched total

## Constitution Check

No project constitution file found (`/.specify/memory/constitution.md` does not exist — only
the template exists). No gates to evaluate. Proceeding with pragmatic quality checks:

- ✅ No new runtime dependencies (ChromaDB fallback uses existing client API)
- ✅ 269 tests maintained throughout
- ✅ Each fix is independently releasable
- ✅ TypeScript upgrade does not alter runtime behavior

## Project Structure

### Documentation (this feature)

```text
specs/004-fix-outstanding-issues/
├── plan.md          ← This file
├── spec.md          ← Feature specification
├── research.md      ← Phase 0 research output
├── data-model.md    ← Phase 1 entity/interface changes
├── quickstart.md    ← Phase 1 quick implementation guide
├── checklists/
│   └── requirements.md
└── contracts/
    ├── typescript-upgrade.md
    ├── prettierignore.md
    ├── memoryvault-fallback.md
    ├── error-messages.md
    └── api-docs-structure.md
```

### Source Code (repository root)

```text
src/
├── cli/
│   ├── ralph-loop.ts              ← No changes
│   └── ui/
│       └── summary-reporter.ts    ← TS error at :311 auto-fixed by TS5 upgrade
├── llm/
│   └── provider-router.ts         ← 3 error message fixes (lines 221, 269, 336)
├── lifecycle/
│   └── tier-config.ts             ← 2 error message fixes (lines 41, 48)
└── memory/
    └── memory-vault.ts            ← ChromaDB fallback (connected flag + timeout)

.prettierignore                    ← Replace with 22-pattern file
tsconfig.json                      ← moduleResolution: "node" → "node16"
package.json                       ← typescript ^4.9.5 → ^5.9.3 + eslint deps

docs/
└── api/
    ├── README.md                  ← New: API docs index
    ├── cli.md                     ← New: CLI flags reference
    ├── config.md                  ← New: ralph.config.yaml schema
    ├── agents.md                  ← New: Agent interface reference
    └── lifecycle.md               ← New: Lifecycle API reference

tests/
└── unit/
    └── memory/
        └── memory-vault-fallback.test.ts   ← New: offline fallback unit tests
```

**Structure Decision**: Single project (existing layout). All changes confined to existing
directories. New `docs/api/` directory for documentation only.

## Complexity Tracking

No constitution violations. All changes are minimal targeted fixes.
