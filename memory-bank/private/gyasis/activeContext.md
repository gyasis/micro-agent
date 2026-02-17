# Active Context

**Last Updated**: 2026-02-17 (003-tiered-escalation)

## Current Focus

Branch `003-tiered-escalation` is complete and has been merged to `main` via a no-ff merge
commit. The feature adds an optional N-tier model escalation system to the Ralph Loop: a
YAML/JSON tier config file defines a chain of N tiers, each with its own model set and budget.
Tiers run sequentially with accumulated failure history injected between each tier. A SQLite
audit database records every attempt for post-run analysis.

The `main` branch is now the active working branch with all 269 tests passing.
No active feature branch exists.

## Recent Changes (This Session - 2026-02-17)

### Feature: 003-tiered-escalation (31 tasks, all complete)

**New source files created:**

- `src/lifecycle/types.ts` -- extended with 8 new interfaces:
  `TierConfig`, `TierModels`, `TierEscalationConfig`, `TierGlobal`, `TierAttemptRecord`,
  `RunMetadataRow`, `AccumulatedFailureSummary`, `TierRunResult`

- `src/lifecycle/tier-config.ts` -- Zod schemas (`TierModelsSchema`, `TierConfigSchema`,
  `TierEscalationConfigSchema`) + `loadTierConfig(filePath)` + `validateTierConfig(config)`
  (returns ALL errors, not just first, using `.issues` not `.errors`)

- `src/lifecycle/tier-engine.ts` -- `runTier(tierCtx, runSimpleIteration, runFullIteration?)`
  N-tier iteration loop; budget checks per iteration; per-tier header logs
  (`━━━━ ▶ Tier N/total: name [mode, model] ━━━━`); records `TierAttemptRecord` per
  iteration; returns `TierRunResult`

- `src/lifecycle/tier-accumulator.ts` -- `buildAccumulatedSummary(priorResults[])` concatenates
  tier failure history with 4000-char cap; `withTierEscalationContext(context, summary)` injects
  accumulated failures into next tier's `AgentContext.escalationContext`

- `src/lifecycle/tier-db.ts` -- SQLite audit log via `better-sqlite3`: `openAuditDatabase`,
  `writeAttemptRecord`, `writeRunMetadata`, `updateRunMetadata`, `closeAuditDatabase` -- all
  best-effort (wrapped in try/catch, never throws to caller)

**Modified source files:**

- `src/cli/commands/run.ts` -- added `runTierLoop()` function: detects `--tier-config` flag,
  loads/validates tier config, prints startup banner table, runs N-tier loop with failure context
  accumulation between tiers, multi-tier final report, SQLite audit DB integration, conflict
  warnings for legacy flags (`--simple`, `--full`, `--no-escalate` alongside `--tier-config`)

- `src/cli/ralph-loop.ts` -- added `--tier-config <path>` CLI flag

- `src/config/schema-validator.ts` -- added `tierConfigFile: z.string().optional()` to YAML
  config schema

**New test files (22 new tests, 269/269 total passing):**

- `tests/unit/lifecycle/tier-config.test.ts` -- Zod schema validation, loadTierConfig, validateTierConfig
- `tests/unit/lifecycle/tier-accumulator.test.ts` -- accumulator logic, 4000-char cap
- `tests/unit/lifecycle/tier-db.test.ts` -- SQLite best-effort DB operations
- `tests/integration/tier-engine.test.ts` -- N-tier loop integration scenarios

**Documentation updated:**

- `docs/tutorials/micro-agent-complete-walkthrough.ipynb` -- Part 13 (N-tier escalation) added;
  Further Reading table updated; test runner cell updated
- `docs/tutorials/model-configuration.md` -- "Advanced: N-Tier Model Escalation (Optional)"
  section added

### Test Results

- Previous: 247/247 passing (after 002-simple-escalation)
- Current: 269/269 passing (+22 new, 0 regressions)

## Key Design Decisions (003-tiered-escalation)

- Tier escalation is entirely opt-in via `--tier-config <path>` flag; default two-phase behavior
  unchanged when flag is absent
- Each tier receives accumulated failure history from all prior tiers via `escalationContext`
  (same field used by two-phase escalation from 002, compatible extension)
- Accumulated summary cap is 4000 chars (vs 2000 for simple-mode summary) to accommodate more
  history across more tiers
- SQLite audit DB (`better-sqlite3`) is best-effort: failures never abort the run
- Fresh context per iteration preserved inside each tier (Ralph Loop gold standard intact)
- `validateTierConfig()` returns ALL Zod issues (not just first) for better UX
- Zod v3 API: use `.issues` on `SafeParseError`, not `.errors`
- Tier config conflict warnings are intentional -- surface misconfiguration, not silent ignore

## Next Actions

- :white_large_square: **004-next-feature**: No branch planned yet. Project is in a stable state.
- :white_large_square: **Task: API docs** (`docs/api/`): API reference documentation not yet written.
  Lower priority. Covers CLI commands, configuration schema, agent interfaces, lifecycle API.
- :white_large_square: **Ongoing**: Keep `main` green as future features land.

## Blocked / Pending

- Nothing is blocked. `main` is stable and all tests pass.

## Context Notes

- Working directory: `/home/gyasis/Documents/code/micro-agent`
- Active branch: `main`
- Last merge: `003-tiered-escalation` no-ff merge into main
- Key commits: `b1e8506` (docs), `1afed92` (wire tier engine), `93177e0` (Wave 1 foundation),
  `9c8c192` (chore: tasks/plan)
- Working tree at git status snapshot: M package-lock.json, M src/cli/commands/run.ts
  (reflects 003 work now merged)
