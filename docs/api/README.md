# Micro Agent API Reference

**Version**: v0.1.5 | **Package**: `@builder.io/micro-agent`

This directory contains the complete API reference for the Micro Agent (Ralph Loop 2026) system.

## Table of Contents

| Page | Description |
|------|-------------|
| [cli.md](./cli.md) | All CLI flags for the `ma`/`ma-loop` entry points — flags, types, defaults, examples |
| [config.md](./config.md) | Full `ralph.config.yaml` schema — every field, type, default, and valid value |
| [agents.md](./agents.md) | Agent interface reference — `AgentContext`, `LibrarianOutput`, `ArtisanOutput`, `CriticOutput`, `BudgetConstraints`, and all supporting types |
| [lifecycle.md](./lifecycle.md) | Lifecycle API — `IterationManager`, `ContextMonitor`, `SessionResetter`, `TierEngine`, `buildAccumulatedSummary`, `withTierEscalationContext` |

## Quick Navigation

### Running the CLI

```bash
# Simple mode (5 iterations before auto-escalation)
ma-loop run ./src/math.ts --test "npm test"

# Full multi-agent loop
ma-loop run ./src/math.ts --test "npm test" --full

# N-tier escalation with custom config
ma-loop run ./src/math.ts --test "npm test" --tier-config ./tiers.json
```

See [cli.md](./cli.md) for all flags.

### Configuring the System

Create `ralph.config.yaml` in your project root:

```yaml
models:
  artisan:
    provider: anthropic
    model: claude-sonnet-4-20250514
budgets:
  maxIterations: 10
  maxCostUsd: 1.0
```

See [config.md](./config.md) for the full schema.

### Using Agent Interfaces

```typescript
import { createAgentContext } from './src/agents/base/agent-context';

const ctx = createAgentContext({
  sessionId: 'my-session',
  iteration: 1,
  maxIterations: 10,
  objective: 'Fix the multiply function',
  workingDirectory: '/path/to/project',
  targetFile: 'src/math.ts',
  testCommand: 'npm test',
  testFramework: 'vitest',
  maxCostUsd: 2.0,
  maxDurationMinutes: 15,
});
```

See [agents.md](./agents.md) for all interfaces.

### Lifecycle Components

```typescript
import { IterationManager } from './src/lifecycle/iteration-manager';
import { ContextMonitor } from './src/lifecycle/context-monitor';

const monitor = new ContextMonitor({ maxTokens: 200_000 });
monitor.registerAgent('librarian');
monitor.registerAgent('artisan');
monitor.registerAgent('critic');
```

See [lifecycle.md](./lifecycle.md) for the full lifecycle API.

## Usage Examples

For step-by-step tutorials, see [docs/tutorials/](../tutorials/).

---

*Generated for Micro Agent v0.1.5*
