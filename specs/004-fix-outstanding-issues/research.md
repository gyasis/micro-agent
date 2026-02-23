# Research: 004 — Fix Outstanding Issues

**Branch**: `004-fix-outstanding-issues` | **Date**: 2026-02-20

---

## Issue 1: TypeScript Version Incompatibility

### Decision
Upgrade TypeScript from `^4.9.5` to `^5.9.3` (latest stable as of 2026-02-20).
Change `tsconfig.json` `moduleResolution` from `"node"` to `"node16"`.

### Rationale
Zod v4 uses `const` type parameters — a TypeScript 5 language feature (`TS1389: 'const' is
not allowed as a variable declaration name` in TS 4.x). `skipLibCheck: true` is already in
tsconfig but TS 4.9.5 does not fully honour it for `.d.cts` files (the new CJS declaration
format Zod v4 and XState use). Upgrading to TS 5.x resolves all node_modules errors.

The `summary-reporter.ts:311` error (`const { promises as fs } = await import('fs')`) is also
caused by TS 4.9.5 + `moduleResolution: "node"` — the same line is valid syntax in TS 5.x.
No source-code change required on that line.

### Additional package updates required alongside TS upgrade
| Package | Current | Target | Why |
|---|---|---|---|
| `typescript` | `^4.9.5` | `^5.9.3` | Core upgrade |
| `@typescript-eslint/parser` | `^5.62.0` | `^8.x` | ESLint parser must match TS major |
| `@typescript-eslint/eslint-plugin` | `^5.62.0` | `^8.x` | Same |
| `@types/node` | `^18.19.130` | `^18.21.0` | Latest TS5-compatible 18.x patch |

### tsconfig.json change
```diff
- "moduleResolution": "node",
+ "moduleResolution": "node16",
```

### Risk assessment
No breaking changes expected in `src/`:
- No decorators, no enums, no `declare global/module` in the codebase
- All `import { X as Y }` and `as const` patterns are valid in TS5
- `(value as any)` type assertions unchanged
- Runtime is unaffected (TypeScript is compile-time only)

### Alternatives considered
- Pin Zod to v3 instead of upgrading TS — rejected because Zod v4 is already installed and
  used; downgrading would require rewriting schema code
- Add `"skipDefaultLibCheck": true` — rejected; doesn't cover `.d.cts` in TS 4.x
- Manually patch Zod's `.d.cts` files — rejected; fragile, breaks on `npm install`

---

## Issue 2: Prettier Lint Warnings

### Decision
Replace the 3-line `.prettierignore` with a comprehensive 22-pattern file covering all
generated, vendor, spec, test, and config directories. `src/` remains uncovered (still linted).

### New `.prettierignore` content
```
# Build and compiled output
dist/
.next

# Dependencies
node_modules/

# Specifications and documentation
specs/
PRD/
research_reports/
docs/tutorials/*.ipynb

# Test and example files
test/
tests/
test-example/

# Scripts and utilities
scripts/

# Generated metadata and session data
.specstory/
.specify/
memory-bank/

# IDE and tool configuration
.vscode/
.devkid/
.claude/
.husky/
.github/

# Changelog
CHANGELOG.md

# Prompts
**/*.prompt.md
```

### Rationale
114 files outside `src/` trigger warnings: generated specs, Jupyter notebooks, fixture projects
(Next.js app in `test/`), scripts, and metadata dirs. Ignoring them restores the signal value
of `prettier --check` as a real source-quality gate.

### src/ not ignored
`src/` files are intentionally NOT in the ignore list so real TypeScript source continues to
be checked. Any unformatted `src/` files will be caught and can be fixed with `prettier --write`.

---

## Issue 3: ChromaDB Offline Fallback

### Decision
Use **Approach A**: timeout + `connected: boolean` flag within the existing `MemoryVault` class.
No separate `NoOpMemoryVault` class needed. No new dependencies.

### Implementation contract
- Add `private connected: boolean = true` to `MemoryVault`
- In `initialize()`: wrap both `getOrCreateCollection()` calls in `Promise.race` against a
  3-second timeout. On any rejection, set `this.connected = false` and log at `warn` level.
  Do **not** re-throw.
- Add guard `if (!this.connected) return;` (or `return []` / `return { fixPatterns: 0, testPatterns: 0 }`)
  at the top of every public method that touches ChromaDB
- Add public getter `isConnected(): boolean { return this.connected; }`
- Exactly **one** `warn` log on connection failure; subsequent no-op calls log at `debug` only

### Exact first network touchpoint
`src/memory/memory-vault.ts` lines 61 and 67 — the two `getOrCreateCollection()` calls in
`initialize()`. The constructor at lines 50–52 is network-silent.

### Callers unaffected
`src/lifecycle/ralph-loop.ts` already null-checks `this.memoryVault` before calling it;
the `connected` flag approach requires zero changes to calling code.

### Timeout value
3 seconds — covers typical localhost network RTT + ChromaDB cold-start, without blocking
the tool startup excessively.

### Alternatives considered
- TCP probe before instantiation — rejected; adds `net` module dependency and still requires
  a try/catch fallback; no real advantage over the cleaner Promise.race approach
- Separate `NoOpMemoryVault` class — rejected; requires an interface abstraction and factory
  function in every call site; adds complexity for no gain
- `heartbeat()` ping before `getOrCreateCollection()` — rejected; adds an extra round-trip

---

## Issue 4: Error Messages Lacking Remediation Steps

### Decision
Add a `→ Fix:` line to each of the 5 identified error throws. All are inline throws; no
centralized error handler is needed.

### Exact locations and proposed messages

| # | File | Line | Current message | Updated message |
|---|---|---|---|---|
| 1 | `src/llm/provider-router.ts` | 221 | `'Anthropic API key required'` | `'Anthropic API key required\n→ Fix: Set ANTHROPIC_API_KEY=sk-... in your .env file'` |
| 2 | `src/llm/provider-router.ts` | 269 | `'Google API key required'` | `'Google API key required\n→ Fix: Set GOOGLE_API_KEY=... or GEMINI_API_KEY=... in your .env file'` |
| 3 | `src/llm/provider-router.ts` | 336 | `'OpenAI API key required'` | `'OpenAI API key required\n→ Fix: Set OPENAI_API_KEY=sk-... in your .env file'` |
| 4 | `src/lifecycle/tier-config.ts` | 41 | `'Tier config not found: ${filePath}\n  ${err.message}'` | append `\n→ Fix: Verify the file exists at ${filePath} (use absolute path or path relative to cwd)` |
| 5 | `src/lifecycle/tier-config.ts` | 48 | `'Tier config parse error in ${filePath}: ${err.message}'` | append `\n→ Fix: Validate JSON with: cat "${filePath}" | jq .` |

### Constraint
Remediation lines must not echo secret values (API keys are referenced by env var name only,
not their values).

---

## Issue 5: Missing API Documentation (`docs/api/`)

### Decision
Create 5 hand-authored Markdown files in `docs/api/` covering the full public surface of the
ralph-loop CLI and programmatic API. No auto-gen tooling introduced.

### File structure
```
docs/api/
├── README.md       — index with table of contents and quick navigation
├── cli.md          — all CLI flags for both `micro-agent` and `ralph-loop` commands
├── config.md       — full ralph.config.yaml schema with types, defaults, valid values
├── agents.md       — AgentContext, LibrarianOutput, ArtisanOutput, CriticOutput interfaces
└── lifecycle.md    — IterationManager, ContextMonitor, SessionResetter, TierEngine APIs
```

### Source of truth for each doc
- `cli.md` ← `src/cli/ralph-loop.ts` (commander option registrations)
- `config.md` ← `src/config/schema-validator.ts` + `src/config/defaults.ts`
- `agents.md` ← `src/agents/base/agent-context.ts` (all exported interfaces)
- `lifecycle.md` ← `src/lifecycle/` public exports + tier-config/engine interfaces
