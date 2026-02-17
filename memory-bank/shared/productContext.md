# Product Context

**Purpose**: Product strategy and user needs

**Last Updated**: 2026-02-17 (003-tiered-escalation)

## Target Users

- **Developer using AI-assisted coding**: Engineers who want automated, test-driven code generation
  and bug fixing without spending hours prompting an LLM manually
- **Team lead or tech lead**: Someone enforcing code quality via test suites who wants AI to
  produce passing code on autopilot
- **Polyglot developer**: Works in TypeScript, Python, Rust, or JavaScript and wants a single
  tool that handles all environments

## User Needs

- Run a single command against a file + test suite and get back working, passing code
- See how much each iteration costs (budget transparency)
- Configure which LLM each agent uses (librarian, artisan, critic)
- Not have to babysit the loop - it should stop automatically when tests pass or budget exhausted
- Understand what the AI is doing at each step (verbose logging)

## Product Strategy

- **Name**: Micro Agent (package: `@builder.io/micro-agent`)
- **Method**: Ralph Loop 2026 - frequent context resets, git-based state persistence
- **Positioning**: The smarter AI coding assistant that knows its own limits (context window
  management built in)
- **CLI Entry Point**: `ralph-loop run <target>` with sensible defaults
- **Defaults**: Three providers (Gemini for context gathering, Claude for code generation, GPT
  for code review) each doing what they do best

## Key Differentiators

- Context-aware architecture: unlike naively long-running LLM sessions, Micro Agent resets
  context every iteration to stay in the "Smart Zone"
- Multi-provider by design: not locked to one LLM vendor; uses the best tool for each job
- Test-driven convergence: success is defined by tests passing, not by LLM confidence
- Cost control: configurable max cost with per-iteration tracking and early termination
- Two-phase execution model: Simple Mode (fast, cheap) escalates to Full Mode (deep) only when
  needed, with compressed failure history injected into the Librarian's context for informed
  continuation -- avoids wasted cost on easy problems while preserving full power for hard ones
- N-Tier Model Escalation (optional): A configurable tier chain where each tier uses a different
  model combination; each tier receives the accumulated failure history from all prior tiers via
  `escalationContext`, allowing progressively stronger/costlier models to be deployed only when
  cheaper tiers fail. Defined via a YAML or JSON tier config file passed with `--tier-config`.
  All tier attempts are recorded to a SQLite audit database for analysis.

## Documentation

- `docs/tutorials/typescript-javascript.md` - TypeScript/JavaScript usage guide
- `docs/tutorials/python.md` - Python usage guide
- `docs/tutorials/rust.md` - Rust usage guide
- `docs/tutorials/model-configuration.md` - Per-agent model configuration guide; updated with
  "Advanced: N-Tier Model Escalation" section (added in 003-tiered-escalation)
- `docs/tutorials/micro-agent-complete-walkthrough.ipynb` - Jupyter notebook walkthrough; Part 13
  on N-tier escalation added in 003-tiered-escalation
- API documentation in `docs/api/` -- NOT YET WRITTEN (pending task #3)
