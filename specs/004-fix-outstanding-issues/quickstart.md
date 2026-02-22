# Quickstart: 004 — Fix Outstanding Issues

**Branch**: `004-fix-outstanding-issues`

5 independent fixes. Apply in priority order (P1 first). Each fix is self-contained and can
be tested in isolation before moving to the next.

---

## P1 — TypeScript Upgrade (~10 min)

```bash
# 1. Install TS 5.x + updated ESLint packages
npm install --save-dev typescript@^5.9.3 \
  @typescript-eslint/parser@^8.0.0 \
  @typescript-eslint/eslint-plugin@^8.0.0 \
  @types/node@^18.21.0

# 2. Edit tsconfig.json: change moduleResolution
#    "moduleResolution": "node"  →  "moduleResolution": "node16"

# 3. Verify
npx tsc --noEmit          # must exit 0, zero output
npm test                  # must be 269/269
```

See contract: `contracts/typescript-upgrade.md`

---

## P2 — Prettier Ignore (~5 min)

```bash
# 1. Replace .prettierignore with content from contracts/prettierignore.md

# 2. Verify
npx prettier --check "**/*.ts"    # exit 0, zero [warn]
npm test                           # 269/269
```

See contract: `contracts/prettierignore.md`

---

## P3 — ChromaDB Offline Fallback (~30 min)

```bash
# 1. Edit src/memory/memory-vault.ts:
#    - Add `private connected: boolean = true` field
#    - Wrap initialize() getOrCreateCollection calls in Promise.race with 3s timeout
#    - On catch: set connected=false, log warn, do NOT throw
#    - Add `if (!this.connected) return;` guards to all public methods
#    - Add `isConnected(): boolean` getter

# 2. Add unit tests in tests/unit/memory/memory-vault-fallback.test.ts
#    - Test: initialize() with unreachable server → connected=false, no throw
#    - Test: storeFixPattern() when connected=false → no-op, no throw
#    - Test: searchFixPatterns() when connected=false → returns []
#    - Test: isConnected() returns false after failed init

# 3. Verify
npm test                  # 269+ passing (new tests included)
```

See contract: `contracts/memoryvault-fallback.md`

---

## P4 — Error Message Remediation (~15 min)

```bash
# 1. Edit src/llm/provider-router.ts lines 221, 269, 336
#    Append \n→ Fix: ... to each throw message

# 2. Edit src/lifecycle/tier-config.ts lines 41, 48
#    Append \n→ Fix: ... to each throw message

# 3. Verify (trigger errors manually if needed, or check string content)
npm test    # 269/269

# Optional smoke test:
ANTHROPIC_API_KEY="" npx ma-loop run ./src/math.ts --test "npm test" 2>&1 | grep "Fix:"
```

See contract: `contracts/error-messages.md`

---

## P5 — API Documentation (~60 min)

```bash
# 1. mkdir docs/api

# 2. Create 5 files using contracts/api-docs-structure.md as the outline:
#    - docs/api/README.md
#    - docs/api/cli.md      (source: src/cli/ralph-loop.ts)
#    - docs/api/config.md   (source: src/config/schema-validator.ts + defaults.ts)
#    - docs/api/agents.md   (source: src/agents/base/agent-context.ts)
#    - docs/api/lifecycle.md (source: src/lifecycle/*.ts)

# 3. Verify
ls docs/api/              # 5 files present
wc -l docs/api/*.md       # total ≥ 300 lines
npm test                  # 269/269 (docs don't affect tests)
```

See contract: `contracts/api-docs-structure.md`

---

## Final verification

```bash
npx tsc --noEmit                  # exit 0, zero errors
npx prettier --check "**/*.ts"    # exit 0, zero [warn]
npm test                          # 269+ passing
ls docs/api/                      # 5 files
```
