# CLI Reference

Micro Agent ships two binary entry points that invoke the same underlying engine:

| Binary        | Alias         | Description                        |
|---------------|---------------|------------------------------------|
| `ralph-loop`  | `ma-loop`     | Full-featured loop CLI (this file) |
| `micro-agent` | `ma`          | Alias — delegates to `ralph-loop`  |

Both binaries accept the same sub-commands.  The sections below document every
flag emitted by the Commander definitions in
`src/cli/ralph-loop.ts`.

---

## Top-level usage

```
ralph-loop <command> [options]
ma-loop    <command> [options]
```

Running either binary with no arguments prints the built-in help text.

---

## Commands

### `run` — Main workflow

Start a Ralph Loop session against a target file or natural-language objective.

```
ralph-loop run <target> [options]
ma-loop    run <target> [options]
```

**Positional argument**

| Argument  | Type   | Required | Description                                                                 |
|-----------|--------|----------|-----------------------------------------------------------------------------|
| `target`  | string | Yes      | Path to the source file to improve, or a free-form objective string.        |

**Options**

| Flag                          | Short | Type        | Default    | Description                                                                                                      | Example                                         |
|-------------------------------|-------|-------------|------------|------------------------------------------------------------------------------------------------------------------|-------------------------------------------------|
| `--objective <text>`          | `-o`  | string      | —          | Explicit objective; overrides the objective inferred from `target`.                                              | `--objective "Fix all TypeScript errors"`       |
| `--test <command>`            | `-t`  | string      | —          | Shell command used to validate success. Runs after each Artisan iteration.                                       | `--test "npm test"`                             |
| `--framework <name>`          | `-f`  | string      | `vitest`   | Test-output parser. One of: `vitest`, `jest`, `pytest`, `cargo`, `custom`.                                      | `--framework jest`                              |
| `--max-iterations <n>`        | `-i`  | number      | `30`       | Hard cap on total loop iterations regardless of budget.                                                          | `--max-iterations 10`                           |
| `--max-budget <n>`            | `-b`  | number      | `2.00`     | Maximum spend in USD across all agent calls. Loop exits when this limit is reached.                              | `--max-budget 0.50`                             |
| `--max-duration <n>`          | `-d`  | number      | `15`       | Maximum wall-clock runtime in minutes. Loop exits when this limit is reached.                                    | `--max-duration 5`                              |
| `--config <path>`             | `-c`  | path        | —          | Path to a `ralph.config.yaml` file. Overrides auto-discovery.                                                   | `--config ./configs/ralph.config.yaml`          |
| `--librarian <model>`         | —     | string      | `gemini-2.5-flash`          | Override the Librarian agent model identifier.                                                  | `--librarian gemini-2.5-flash`                  |
| `--artisan <model>`           | —     | string      | `claude-sonnet-4-20250514`  | Override the Artisan agent model identifier.                                                    | `--artisan claude-sonnet-4-20250514`            |
| `--critic <model>`            | —     | string      | `gpt-4o-mini`               | Override the Critic agent model identifier.                                                     | `--critic gpt-4o-mini`                          |
| `--chaos <model>`             | —     | string      | —          | Override the Chaos (adversarial) agent model identifier.                                                         | `--chaos claude-sonnet-4-20250514`              |
| `--no-adversarial`            | —     | boolean     | `false`    | Skip the Chaos adversarial-testing phase entirely.                                                               | `--no-adversarial`                              |
| `--reset-frequency <n>`       | —     | number      | `1`        | How often (in iterations) the context window is reset. Default `1` gives a fresh context every iteration.        | `--reset-frequency 3`                           |
| `--verbose`                   | —     | boolean     | `false`    | Enable verbose structured logging — prints agent inputs/outputs, token counts, and per-iteration cost.           | `--verbose`                                     |
| `--simple [n]`                | —     | number      | `5`        | Run in **simple mode** (Artisan + Tests only) for N iterations before escalating to full mode.                   | `--simple 3`                                    |
| `--no-escalate`               | —     | boolean     | `false`    | Disable auto-escalation. When combined with `--simple`, the loop exits with failure after simple-mode exhaustion instead of escalating. | `--simple --no-escalate`    |
| `--full`                      | —     | boolean     | `false`    | Skip simple mode entirely and run the full pipeline (Librarian → Artisan → Critic → Tests) from iteration 1.    | `--full`                                        |
| `--tier-config <path>`        | —     | path        | —          | Path to a JSON tier-configuration file. Enables **N-tier escalation mode** where each tier can specify a different model set and iteration budget. | `--tier-config ./tiers.json` |

**Pipeline modes summary**

```
Default (no flags):  simple-mode (5 iters) → auto-escalate → full pipeline
--simple 3:          simple-mode (3 iters) → auto-escalate → full pipeline
--simple 3 --no-escalate:  simple-mode (3 iters) → exit with failure
--full:              full pipeline from iteration 1
--tier-config <f>:   N-tier escalation driven by JSON file
```

**Usage examples**

```bash
# Minimal — infer everything from the target file
ralph-loop run ./src/math.ts --test "npm test"

# Cap cost and time, verbose output
ralph-loop run ./src/math.ts --test "npm test" --max-budget 1.00 --max-duration 10 --verbose

# Skip the context-gathering Librarian and jump to the full pipeline
ralph-loop run ./src/math.ts --test "npm test" --full

# Simple mode: Artisan+Tests only for the first 3 iterations, then escalate
ralph-loop run ./src/math.ts --test "npm test" --simple 3

# Simple mode with no escalation — fail fast
ralph-loop run ./src/math.ts --test "npm test" --simple 3 --no-escalate

# N-tier escalation
ralph-loop run ./src/math.ts --test "npm test" --tier-config ./tiers.json

# Override models and use a custom framework
ralph-loop run ./src/app.py --test "pytest" --framework pytest \
  --librarian gemini-2.5-flash --artisan claude-sonnet-4-20250514 --critic gpt-4o-mini
```

---

### `config` — Validate or inspect configuration

```
ralph-loop config [options]
```

| Flag               | Short | Type   | Description                                               | Example                       |
|--------------------|-------|--------|-----------------------------------------------------------|-------------------------------|
| `--path <path>`    | `-p`  | path   | Path to the config file to inspect or validate.           | `--path ./ralph.config.yaml`  |
| `--validate`       | —     | boolean| Parse and validate the config file; exit 0 on success.    | `--validate`                  |
| `--show-defaults`  | —     | boolean| Print the built-in default configuration and exit.        | `--show-defaults`             |

**Usage examples**

```bash
# Validate a config file
ralph-loop config --path ./ralph.config.yaml --validate

# Dump built-in defaults
ralph-loop config --show-defaults
```

---

### `status` — Inspect session state

```
ralph-loop status [options]
```

| Flag               | Short | Type   | Description                                   | Example              |
|--------------------|-------|--------|-----------------------------------------------|----------------------|
| `--session <id>`   | `-s`  | string | Session ID to inspect.                        | `--session abc123`   |
| `--latest`         | —     | boolean| Show the most recently active session.        | `--latest`           |
| `--all`            | —     | boolean| List all known sessions with their status.    | `--all`              |

**Usage examples**

```bash
# Show the latest session progress
ralph-loop status --latest

# Show all recorded sessions
ralph-loop status --all
```

---

### `reset` — Clean up session state

```
ralph-loop reset [options]
```

| Flag               | Short | Type   | Description                                        | Example              |
|--------------------|-------|--------|----------------------------------------------------|----------------------|
| `--session <id>`   | `-s`  | string | Reset a specific session by ID.                    | `--session abc123`   |
| `--all`            | —     | boolean| Reset all sessions.                               | `--all`              |
| `--memory`         | —     | boolean| Clear the memory vault (fix-pattern database).    | `--memory`           |
| `--force`          | `-f`  | boolean| Skip the interactive confirmation prompt.         | `--force`            |

**Usage examples**

```bash
# Reset a single session
ralph-loop reset --session abc123

# Wipe everything (sessions + memory vault) without prompting
ralph-loop reset --all --memory --force
```

---

## Environment variables

API credentials are loaded from a `.env` file in the working directory (via `dotenv`)
before any config file or CLI flags are processed.

| Variable                  | Agent     | Description                                  |
|---------------------------|-----------|----------------------------------------------|
| `ANTHROPIC_API_KEY`       | Artisan   | Required when using Anthropic models.        |
| `OPENAI_API_KEY`          | Critic    | Required when using OpenAI models.           |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Librarian | Required when using Google Gemini models. |

---

## Exit codes

| Code | Meaning                                                   |
|------|-----------------------------------------------------------|
| `0`  | All tests passed; objective achieved.                     |
| `1`  | Unrecoverable error (budget exceeded, entropy detected, etc.). |
