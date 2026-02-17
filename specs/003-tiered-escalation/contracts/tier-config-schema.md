# Contract: Tier Configuration Schema

**Feature**: 003-tiered-escalation
**Date**: 2026-02-17
**File type**: JSON (`tiers.json` or user-named path)

---

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TierEscalationConfig",
  "type": "object",
  "required": ["tiers"],
  "additionalProperties": false,
  "properties": {
    "tiers": {
      "type": "array",
      "minItems": 1,
      "description": "Ordered list of model tiers. Executed in array order.",
      "items": {
        "type": "object",
        "required": ["name", "mode", "maxIterations", "models"],
        "additionalProperties": false,
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "description": "Human-readable label for this tier (used in reports and audit log)"
          },
          "mode": {
            "type": "string",
            "enum": ["simple", "full"],
            "description": "simple = artisan + tests only; full = librarian + artisan + critic + tests"
          },
          "maxIterations": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "description": "Maximum iterations before escalating to next tier. Soft cap — global budget takes precedence."
          },
          "models": {
            "type": "object",
            "required": ["artisan"],
            "additionalProperties": false,
            "properties": {
              "artisan": {
                "type": "string",
                "minLength": 1,
                "description": "Model for code-writing agent. Required for all tiers."
              },
              "librarian": {
                "type": "string",
                "minLength": 1,
                "description": "Model for context-analysis agent. Required for full mode; ignored in simple mode. Defaults to artisan model if omitted."
              },
              "critic": {
                "type": "string",
                "minLength": 1,
                "description": "Model for code-review agent. Required for full mode; ignored in simple mode. Defaults to artisan model if omitted."
              }
            }
          }
        }
      }
    },
    "global": {
      "type": "object",
      "additionalProperties": false,
      "description": "Global settings shared across all tiers",
      "properties": {
        "auditDbPath": {
          "type": "string",
          "description": "Path to SQLite audit database. Relative paths resolve from working directory. Default: .micro-agent/audit.db"
        },
        "maxTotalCostUsd": {
          "type": "number",
          "exclusiveMinimum": 0,
          "description": "Hard cost cap in USD across all tiers combined. Overrides individual tier budgets."
        },
        "maxTotalDurationMinutes": {
          "type": "number",
          "exclusiveMinimum": 0,
          "description": "Hard time cap in minutes across all tiers combined."
        }
      }
    }
  }
}
```

---

## Example: 3-Tier Config (local → haiku → sonnet)

```json
{
  "tiers": [
    {
      "name": "local-free",
      "mode": "simple",
      "maxIterations": 5,
      "models": {
        "artisan": "ollama/codellama"
      }
    },
    {
      "name": "mid-grade",
      "mode": "simple",
      "maxIterations": 3,
      "models": {
        "artisan": "claude-haiku-4-5-20251001"
      }
    },
    {
      "name": "power",
      "mode": "full",
      "maxIterations": 5,
      "models": {
        "artisan": "claude-sonnet-4-5-20250929",
        "librarian": "claude-haiku-4-5-20251001",
        "critic": "claude-haiku-4-5-20251001"
      }
    }
  ],
  "global": {
    "auditDbPath": ".micro-agent/audit.db",
    "maxTotalCostUsd": 2.00,
    "maxTotalDurationMinutes": 30
  }
}
```

---

## Example: 1-Tier Config (local only, no escalation)

```json
{
  "tiers": [
    {
      "name": "local-only",
      "mode": "simple",
      "maxIterations": 10,
      "models": {
        "artisan": "ollama/qwen2.5-coder"
      }
    }
  ]
}
```

---

## Example: 2-Tier Config (two cloud models)

```json
{
  "tiers": [
    {
      "name": "fast-cheap",
      "mode": "simple",
      "maxIterations": 5,
      "models": {
        "artisan": "gpt-4o-mini"
      }
    },
    {
      "name": "smart-thorough",
      "mode": "full",
      "maxIterations": 8,
      "models": {
        "artisan": "claude-opus-4-6",
        "librarian": "claude-haiku-4-5-20251001",
        "critic": "claude-haiku-4-5-20251001"
      }
    }
  ],
  "global": {
    "auditDbPath": ".micro-agent/audit.db",
    "maxTotalCostUsd": 5.00
  }
}
```

---

## Validation Errors (FR-012)

All validation happens at startup before any LLM calls. Each error is reported with location.

| Error | Trigger | Message |
|-------|---------|---------|
| File not found | `tierConfigFile` path in YAML doesn't exist | `Tier config not found: <path>` |
| Invalid JSON | Malformed JSON in tier config file | `Tier config parse error: <details>` |
| Schema violation | Missing required field or wrong type | `Tier config invalid: tiers[0].mode must be 'simple' or 'full'` |
| Empty tiers | `tiers: []` | `Tier config invalid: at least 1 tier required` |
| Model not found | Model string not in provider registry | `Tier config invalid: tiers[1].models.artisan 'unknown-model' not found` |

---

## YAML Config Integration

```yaml
# micro-agent.yml (existing config file)
# Add this key to enable tiered escalation:
tierConfigFile: ./tiers.json   # path relative to project root or absolute

# All existing keys continue to work unchanged:
model: claude-sonnet-4-5-20250929
testCommand: npm test
targetFiles:
  - src/multiply.ts
```

**Alternative: CLI flag** (overrides YAML, useful for one-off runs):
```bash
ma-loop run src/multiply.ts --tier-config ./tiers.json
```
