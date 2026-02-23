# Contract: .prettierignore Update

## File
`.prettierignore` (project root)

## Complete replacement content

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

## Constraint: src/ must NOT appear in this file

`src/` is intentionally absent. All TypeScript source under `src/` continues to be checked
by Prettier. Any `src/` formatting issues found after this change should be fixed with
`npx prettier --write "src/**/*.ts"` as a follow-up.

## Acceptance gate

```bash
npx prettier --check "**/*.ts"
# Expected: "All matched files use Prettier code style!"
# Expected exit code: 0
# Expected [warn] lines: 0
```
