# Contract: API Documentation Structure

## Directory
`docs/api/` (new directory)

## Files

### README.md — index
```markdown
# Micro Agent API Reference
- Quick navigation table linking to all 4 doc pages
- One-sentence description of each page
- Version note (v0.1.5)
- Link to docs/tutorials/ for usage examples
```

### cli.md — CLI reference
Covers all flags for both entry points (`ma` / `micro-agent` and `ma-loop` / `ralph-loop run`).

Required table columns: Flag | Type | Default | Description | Example

Must document:
- `--file <path>` / positional file argument
- `--test <command>`
- `--prompt <string>`
- `--simple [N]`
- `--full`
- `--no-escalate`
- `--tier-config <path>`
- `--max-iterations <N>`
- `--budget <USD>`
- `--verbose`
- `--config <path>`

### config.md — ralph.config.yaml schema
Required table columns: Key | Type | Default | Valid Values | Description

Must document every field in `src/config/schema-validator.ts` Zod schema.

### agents.md — Agent interface reference
Must document (from `src/agents/base/agent-context.ts`):
- `AgentContext` (all fields)
- `LibrarianOutput`
- `ArtisanOutput`
- `CriticOutput`
- `IterationState`
- `BudgetConstraints`
- `TestContext`

Required table columns: Field | Type | Required | Description

### lifecycle.md — Lifecycle API reference
Must document (from `src/lifecycle/`):
- `IterationManager` — constructor, public methods
- `ContextMonitor` — `registerAgent()`, `recordTokens()`, threshold behaviour
- `SessionResetter` — constructor options, `reset()` method
- `TierEngine` — `runTier()` signature and return type
- `TierConfig` / `TierEscalationConfig` — full field reference
- `buildAccumulatedSummary()` — signature, 4000-char cap behaviour
- `withTierEscalationContext()` — signature

## Minimum content requirement
Combined total: ≥ 300 lines across the 5 files.

## Source of truth
- cli.md ← `src/cli/ralph-loop.ts` (commander `.option()` calls)
- config.md ← `src/config/schema-validator.ts` + `src/config/defaults.ts`
- agents.md ← `src/agents/base/agent-context.ts`
- lifecycle.md ← `src/lifecycle/*.ts` public exports
