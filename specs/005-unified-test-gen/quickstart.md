# Quickstart: Unified Test Generation

**Feature**: 005-unified-test-gen

## Smoke Tests (Manual E2E)

### Test 1 — Auto-generation (US1)

```bash
# Create a source file with no test companion
echo 'export function multiply(a: number, b: number): number { return a * b; }' > /tmp/math.ts

# Run ma-loop — should auto-generate /tmp/math.test.ts
npx ralph-loop run /tmp/math.ts --objective "implement multiply function"

# Verify: test file created
ls -la /tmp/math.test.ts          # should exist
cat /tmp/math.test.ts             # should contain test code

# Verify: loop ran with scoped command (check logs for "npx vitest run math")
```

### Test 2 — Existing tests passthrough (US2)

```bash
# Use a file that already has a test
npx ralph-loop run src/helpers/llm.ts --objective "add streaming"

# Expected log: "Using existing tests: src/helpers/llm.test.ts"
# Expected: NO new file written
# Expected: loop runs with existing test command
```

### Test 3 — --no-generate opt-out (US3)

```bash
echo 'export function add(a: number, b: number) { return a + b; }' > /tmp/add.ts

npx ralph-loop run /tmp/add.ts --no-generate --test "echo 'mock test'"

# Expected: NO /tmp/add.test.ts created
# Expected: uses "echo 'mock test'" as test command
```

### Test 4 — --test flag skips generation (US4)

```bash
npx ralph-loop run /tmp/math.ts --test "npx vitest run /tmp/math"

# Expected: generation skipped
# Expected: uses provided test command
```

### Test 5 — Rust skip (US5)

```bash
echo 'fn add(a: i32, b: i32) -> i32 { a + b }' > /tmp/lib.rs

npx ralph-loop run /tmp/lib.rs --objective "implement add"

# Expected log: "Skipping test generation for Rust" or similar
# Expected: NO /tmp/lib_test.rs or similar created
# Expected: loop runs with project default test command
```

### Test 6 — Python naming (US5)

```bash
echo 'def multiply(a, b): return a * b' > /tmp/math.py

npx ralph-loop run /tmp/math.py --objective "implement multiply"

# Expected: /tmp/test_math.py created (NOT math.test.py)
```

## Unit Test Command

```bash
npm test -- --testPathPattern="test-generator"
```

## Full Regression

```bash
npm test
```
Expected: all 273 pre-existing tests pass + new test-generator tests.

## TypeScript Check

```bash
npx tsc --noEmit
```
Expected: 0 errors.
