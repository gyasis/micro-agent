# Product Context

**Purpose**: Product strategy and user needs

**Last Updated**: 2026-02-16

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

## Documentation

- `docs/tutorials/typescript-javascript.md` - TypeScript/JavaScript usage guide
- `docs/tutorials/python.md` - Python usage guide
- `docs/tutorials/rust.md` - Rust usage guide
- `docs/tutorials/model-configuration.md` - Per-agent model configuration guide
- API documentation in `docs/api/` -- NOT YET WRITTEN (pending task #3)
