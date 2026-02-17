# Quickstart: Multi-Tier Model Escalation

**Feature**: 003-tiered-escalation
**Date**: 2026-02-17

---

## Overview

Tiered escalation lets you define an ordered sequence of AI models — from free local ones up to the most capable cloud models. The system tries each tier in order, escalating automatically when the current tier fails, and carrying all failure history forward so each tier starts informed.

**Why use it**:
- Run fast, free local models first (Ollama, etc.) — they solve ~80% of simple bugs at $0 cost
- Reserve expensive cloud models for the 20% that need more capability
- Get a full audit trail in SQLite so you can review every attempt if manual intervention is needed

---

## Step 1: Install Ollama (for local tier — optional)

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Pull a code model
ollama pull codellama
# or for a smaller/faster model:
ollama pull qwen2.5-coder:7b

# Start the Ollama server
ollama serve
```

> If you don't want a local tier, skip this step and start with a cloud model as Tier 1.

---

## Step 2: Create Your Tier Config

Create a `tiers.json` file in your project root:

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
    "maxTotalCostUsd": 2.00
  }
}
```

**Mode guide**:
- `"mode": "simple"` — Artisan + Tests only. Fast, cheap. Best for Tier 1 and 2.
- `"mode": "full"` — Librarian + Artisan + Critic + Tests. Most thorough. Best for your last tier.

---

## Step 3: Reference the Config from Your YAML

Add `tierConfigFile` to your `micro-agent.yml`:

```yaml
# micro-agent.yml
tierConfigFile: ./tiers.json
testCommand: npm test
targetFiles:
  - src/multiply.ts
```

---

## Step 4: Run

```bash
ma-loop run src/multiply.ts
```

You'll see output like this:

```
◆ Tiered escalation mode enabled (3 tiers configured)
  Tier 1: local-free   [simple]  ollama/codellama       max 5 iterations
  Tier 2: mid-grade    [simple]  claude-haiku-4-5-...   max 3 iterations
  Tier 3: power        [full]    claude-sonnet-4-5-...  max 5 iterations
◆ Audit log: .micro-agent/audit.db

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▶ Tier 1/3: local-free  [simple, ollama/codellama]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Iteration 1/5 [local-free]
  ...

✖ Tier 1 (local-free) exhausted 5 iterations without success.
◆ Escalating to Tier 2: mid-grade

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▶ Tier 2/3: mid-grade  [simple, claude-haiku-4-5-...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Iteration 1/3 [mid-grade]  (informed by 5 prior failures)
  ...

✔ Fixed by Tier 2 (mid-grade) in iteration 2

━━━ Run Summary ━━━━━━━━━━━━━━━━━━━━━━
  Tier 1 local-free    [simple]  5 iterations  $0.00    ✖ failed
  Tier 2 mid-grade     [simple]  2 iterations  $0.0008  ✔ solved
  Tier 3 power         [full]    — (not reached)

  Total:   7 iterations  |  $0.0008  |  2m 14s
  Audit:   .micro-agent/audit.db  (run: f4a2c781)
```

---

## Step 5: Query the Audit Log

If all tiers fail, query the SQLite database for the full history:

```bash
# Install sqlite3 if needed
brew install sqlite3      # macOS
sudo apt install sqlite3  # Linux

# Open the audit database
sqlite3 .micro-agent/audit.db

# View all iterations for a run
SELECT tier_name, iteration, test_status, error_messages
FROM tier_attempts
WHERE run_id = 'f4a2c781-9e03-4b2d-8c5a-1234abcd5678'
ORDER BY tier_index, iteration;

# Per-tier summary across all runs
SELECT tier_name, COUNT(*) as iterations, SUM(cost_usd) as total_cost
FROM tier_attempts
GROUP BY tier_name;

# Exit
.quit
```

---

## Configuration Options

### Minimal: Local-only (no cloud fallback)

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

### Budget-conscious: Two cloud models

```json
{
  "tiers": [
    {
      "name": "fast",
      "mode": "simple",
      "maxIterations": 5,
      "models": { "artisan": "gpt-4o-mini" }
    },
    {
      "name": "thorough",
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
    "maxTotalCostUsd": 5.00
  }
}
```

---

## CLI Override (one-off run)

```bash
# Use a specific tier config without modifying micro-agent.yml
ma-loop run src/multiply.ts --tier-config ./my-tiers.json
```

---

## Backward Compatibility

Tiered escalation is **fully opt-in**. If you don't add `tierConfigFile` to your YAML or `--tier-config` to your command, nothing changes. The existing `--simple`, `--full`, and `--no-escalate` flags continue to work exactly as before.

---

## Supported Model Providers

Any model string that works in single-model mode also works in tier configs:

| Provider | Example Model String |
|----------|---------------------|
| Ollama (local) | `ollama/codellama`, `ollama/qwen2.5-coder` |
| Anthropic | `claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250929` |
| OpenAI | `gpt-4o-mini`, `gpt-4o` |
| Google | `gemini-2.0-flash`, `gemini-pro` |
| HuggingFace | `huggingface/mistral-7b-instruct` |

Local Ollama models cost $0 — only cloud provider models incur API costs.

---

## Troubleshooting

**"Ollama server not reachable"**: Start Ollama with `ollama serve` before running.

**"Tier config invalid: tiers[0].models.artisan not found"**: Check your model string matches exactly what's supported by the provider.

**"SQLite audit.db write failed"**: If another process has the database open, writes are skipped with a warning. The run continues normally. Close any other database connections.

**"Global budget exhausted"**: Increase `maxTotalCostUsd` in the `global` config block, or reduce `maxIterations` per tier.
