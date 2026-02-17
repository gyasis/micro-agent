# Project Brief

**Purpose**: North Star document - why this project exists

**Last Updated**: 2026-02-17

## Vision

Micro Agent is an AI CLI tool that writes and fixes code autonomously using a multi-agent loop
technique called the Ralph Loop 2026. It orchestrates three specialized LLM agents (Librarian,
Artisan, Critic) in short, fresh-context iterations to produce code that reliably passes test suites.

The core insight is that LLMs perform best in short, focused bursts ("Smart Zone" = first 30-40%
of context window). By resetting context every iteration and using git as external memory, the
system avoids the "Dumb Zone" degradation that plagues long conversations.

## Goals

- **Primary**: Provide a production-ready CLI tool that takes a file + test command and autonomously
  fixes or generates code until all tests pass, within a configurable budget
- **Secondary**: Demonstrate the Ralph Loop 2026 methodology as a replicable pattern for multi-agent
  AI systems
- **Tertiary**: Support multiple languages (TypeScript, Python, Rust, JavaScript) and LLM providers
  (Anthropic, OpenAI, Google Gemini)

## Success Criteria

- All 269 tests pass (currently: YES as of 2026-02-17, +22 from 003-tiered-escalation)
- End-to-end Ralph Loop workflow verified with real APIs (Gemini + Claude + GPT) -- VERIFIED
- Cost per iteration is tracked and stays within configurable budget (~$0.02 typical)
- Three agents collaborate to fix a real code bug (verified with `math.ts` example)
- Branch `001-ralph-loop-2026` merged to `main` (commit c527da1) -- DONE
- Branch `002-simple-escalation` merged to `main` (commit 8d42927) -- DONE
- Branch `003-tiered-escalation` merged to `main` (no-ff merge) -- DONE
- Simple Mode + Auto-Escalation pipeline operational with `--simple`, `--full`, `--no-escalate` flags
- N-Tier Model Escalation pipeline operational with `--tier-config <path>` flag and JSON/YAML
  tier config files

## Constraints

- **Technical**: Requires API keys for Anthropic, OpenAI, and Google Gemini in `.env`
- **Technical**: XState v5 API must be used (createActor pattern, not v4 machine.context)
- **Technical**: Model names must be 2026-current: `gemini-2.5-flash`, `claude-sonnet-4-20250514`,
  `gpt-4o-mini`
- **Technical**: Zod v3 API uses `.issues` not `.errors` on SafeParseError results
- **Business**: Package published as `@builder.io/micro-agent` v0.1.5
- **Process**: Only the `memory-bank-keeper` agent may modify the memory-bank folder
