# Micro Agent - TypeScript/JavaScript Tutorial

Complete guide for using Micro Agent with TypeScript and JavaScript projects using Vitest or Jest.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Project Setup](#project-setup)
- [Configuration](#configuration)
- [Basic Usage](#basic-usage)
- [Framework-Specific Examples](#framework-specific-examples)
- [Common Use Cases](#common-use-cases)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Prerequisites

- **Node.js**: 18.x or 20.x (LTS versions recommended)
- **npm** or **pnpm** or **yarn**
- **TypeScript**: 4.9+ (if using TypeScript)
- **Test Framework**: Vitest 1.x or Jest 29.x
- **Git**: For version control

---

## Installation

### Global Installation (Recommended)

```bash
npm install -g @builder.io/micro-agent

# Verify installation
micro-agent --version
```

### Local Installation

```bash
# Add to project
npm install --save-dev @builder.io/micro-agent

# Run using npx
npx micro-agent --file src/utils/calculator.ts
```

---

## Project Setup

### Initialize TypeScript Project

```bash
# Create new project
mkdir my-ts-project && cd my-ts-project
npm init -y

# Install TypeScript and testing framework
npm install --save-dev typescript vitest @vitest/ui

# Initialize TypeScript config
npx tsc --init
```

### Configure Vitest

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '*.config.ts'],
    },
  },
});
```

### Configure Jest (Alternative)

Create `jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
};
```

---

## Configuration

### Create ralph.config.yaml

```yaml
# AI Model Configuration
models:
  librarian:
    provider: google
    model: gemini-2.0-pro
    temperature: 0.3  # Precise analysis

  artisan:
    provider: anthropic
    model: claude-sonnet-4.5
    temperature: 0.7  # Balanced code generation

  critic:
    provider: openai
    model: gpt-4.1-mini
    temperature: 0.2  # Strict review

  chaos:
    provider: anthropic
    model: claude-sonnet-4.5
    temperature: 0.9  # Creative testing

# Language Settings
languages:
  typescript:
    testPattern: '**/*.test.ts'
    coverageTool: 'v8'
  javascript:
    testPattern: '**/*.test.js'
    coverageTool: 'v8'

# Testing Configuration
testing:
  adversarialTests: true
  propertyBasedTests: true
  mutationTesting: false  # Optional - requires Stryker
  coverageThreshold: 90

# Budget Constraints
budgets:
  maxIterations: 30
  maxCostUsd: 2.0
  maxDurationMinutes: 15

# Success Criteria
successCriteria:
  testsPass: true
  adversarialTestsPass: true
  coverageThreshold: 90
```

### Environment Variables

Create `.env`:

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Optional: ChromaDB for MemoryVault
CHROMA_HOST=localhost
CHROMA_PORT=8000
```

---

## Basic Usage

### 1. Fix Failing Tests

```bash
# Let Micro Agent fix test failures
micro-agent --file src/utils/calculator.ts

# With specific prompt
micro-agent --file src/utils/calculator.ts \
  --prompt "Fix the division by zero edge case"
```

**What happens:**
1. 📚 **Librarian** analyzes test failures and dependencies
2. ✍️ **Artisan** generates fix based on test requirements
3. 🔎 **Critic** reviews code quality and logic
4. 🧪 Tests run automatically (Vitest/Jest detected)
5. 💥 **Chaos** runs adversarial tests if unit tests pass
6. 🔄 Iterates with fresh context until success

### 2. Interactive Mode

```bash
# Run without arguments for interactive prompts
micro-agent

# You'll be prompted for:
# - Target file or directory
# - Objective/prompt
# - Test command (auto-detected)
```

### 3. Watch Mode

```bash
# Auto-fix on file changes
micro-agent --file src/ --watch
```

---

## Framework-Specific Examples

### Vitest Example

**Project Structure:**
```
my-project/
├── src/
│   ├── calculator.ts
│   └── calculator.test.ts
├── vitest.config.ts
├── ralph.config.yaml
└── package.json
```

**calculator.ts:**
```typescript
export function add(a: number, b: number): number {
  return a + b;
}

export function divide(a: number, b: number): number {
  // BUG: No check for division by zero
  return a / b;
}
```

**calculator.test.ts:**
```typescript
import { describe, it, expect } from 'vitest';
import { add, divide } from './calculator';

describe('Calculator', () => {
  it('should add two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('should divide two numbers', () => {
    expect(divide(10, 2)).toBe(5);
  });

  it('should handle division by zero', () => {
    // This test will fail initially
    expect(() => divide(10, 0)).toThrow('Cannot divide by zero');
  });
});
```

**Run Micro Agent:**
```bash
micro-agent --file src/calculator.ts
```

**Expected Output:**
```
🤖 Micro Agent session starting (Ralph Loop engine)
   Session: abc123, Budget: 30 iterations, $2.00 max

🔍 Iteration 1/30
   📚 Librarian (Gemini): Analyzed 2 files, found 1 test failure
   ✍️  Artisan (Claude): Added division by zero check
   🔎 Critic (GPT-4.1): Code quality 92/100
   🧪 Tests: 3/3 passed ✅
   💥 Chaos: Running adversarial tests...
      - Property tests: 10/10 passed
      - Boundary tests: 5/5 passed

🎉 SUCCESS! Tests pass + Chaos tests complete
   💰 Cost: $0.15  |  ⏱️  Duration: 23s  |  🔄 Iterations: 1
```

### Jest Example

**jest.config.js:**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
```

**Run with Jest:**
```bash
# Micro Agent auto-detects Jest from package.json
micro-agent --file src/auth.ts
```

---

## Common Use Cases

### Use Case 1: Generate Missing Tests

```bash
micro-agent --file src/utils/validator.ts \
  --prompt "Generate comprehensive unit tests with edge cases"
```

**Result:** Artisan generates tests covering:
- Happy path scenarios
- Edge cases (null, undefined, empty)
- Boundary values
- Error conditions

### Use Case 2: Improve Test Coverage

```bash
micro-agent --file src/services/ \
  --prompt "Increase test coverage to 90%"
```

**Result:**
- Identifies uncovered code paths
- Generates tests for missing scenarios
- Runs coverage analysis
- Iterates until 90% threshold met

### Use Case 3: Refactor with Tests

```bash
micro-agent --file src/legacy/user-manager.ts \
  --prompt "Refactor to use async/await instead of callbacks"
```

**Result:**
- Runs existing tests first (baseline)
- Refactors code incrementally
- Ensures tests still pass after each change
- Adds new tests if needed

### Use Case 4: Fix Flaky Tests

```bash
micro-agent --file src/api/integration.test.ts \
  --prompt "Fix timing-related test flakiness"
```

**Result:**
- Analyzes test failures for patterns
- Adds proper async handling
- Implements retry logic where appropriate
- Validates stability with multiple runs

---

## Troubleshooting

### Issue: "Tests not detected"

**Solution:**
```bash
# Verify test framework in package.json
cat package.json | grep -E "vitest|jest"

# Manually specify test command
micro-agent --file src/app.ts \
  --test "npm test" \
  --framework vitest
```

### Issue: "API key not found"

**Solution:**
```bash
# Check environment variables
echo $ANTHROPIC_API_KEY

# Or create .env file
cat > .env <<EOF
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
EOF
```

### Issue: "Budget exceeded too quickly"

**Solution:**
```yaml
# Adjust budgets in ralph.config.yaml
budgets:
  maxIterations: 50      # Increase iterations
  maxCostUsd: 5.0        # Increase cost limit
  maxDurationMinutes: 30 # Increase time limit
```

### Issue: "Context too large"

**Solution:**
```yaml
# Enable more aggressive context reset
memory:
  contextResetFrequency: 1  # Fresh context every iteration (default)
```

### Issue: "Tests pass but Chaos fails"

**Note:** Adversarial test failures are informational only and don't block success.

To investigate:
```bash
# Check Chaos test results
cat .ralph/session-*/iteration-*/chaos-results.json

# Disable adversarial testing if needed
micro-agent --file src/app.ts --no-adversarial
```

---

## Best Practices

### 1. Start with Clear Test Cases

```typescript
// ✅ Good: Clear, specific test
it('should return 400 for invalid email format', () => {
  const result = validateEmail('not-an-email');
  expect(result.valid).toBe(false);
  expect(result.error).toBe('Invalid email format');
});

// ❌ Bad: Vague test
it('should validate email', () => {
  expect(validateEmail('test')).toBeTruthy();
});
```

### 2. Use Descriptive File Names

```bash
# ✅ Good: Clear target
micro-agent --file src/auth/login-handler.ts

# ❌ Bad: Too generic
micro-agent --file src/utils/helpers.ts
```

### 3. Enable Cost Limits

```yaml
budgets:
  maxCostUsd: 2.0  # Always set a limit
```

### 4. Version Control Integration

```bash
# Create branch before running
git checkout -b fix/calculator-division

# Run Micro Agent
micro-agent --file src/calculator.ts

# Review changes
git diff

# Commit if satisfied
git add .
git commit -m "fix: Add division by zero check

Co-Authored-By: Micro Agent <micro-agent@builder.io>"
```

### 5. Use ralph.config.yaml

```yaml
# Commit config to repo for team consistency
git add ralph.config.yaml
git commit -m "chore: Add Micro Agent configuration"
```

---

## Advanced Features

### Property-Based Testing

Micro Agent automatically generates property-based tests using fast-check:

```typescript
// Generated by Chaos agent
import { fc, test } from '@fast-check/vitest';

test.prop([fc.integer(), fc.integer()])('add is commutative', (a, b) => {
  expect(add(a, b)).toBe(add(b, a));
});
```

### Mutation Testing

Enable mutation testing in `ralph.config.yaml`:

```yaml
testing:
  mutationTesting: true  # Requires @stryker-mutator/core
```

### Custom Plugins

Extend Micro Agent with lifecycle hooks:

```typescript
// plugins/prettier-format.ts
import type { RalphPlugin } from '@builder.io/micro-agent/plugin-sdk';
import prettier from 'prettier';

export const prettierPlugin: RalphPlugin = {
  name: 'auto-format',
  version: '1.0.0',

  async onAfterGen(context, generated) {
    const formatted = await prettier.format(generated.code, {
      parser: 'typescript',
    });
    return { ...generated, code: formatted };
  },
};
```

Register in `ralph.config.yaml`:

```yaml
plugins:
  - path: './plugins/prettier-format.ts'
    enabled: true
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/micro-agent.yml
name: Micro Agent

on: [push, pull_request]

jobs:
  fix-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install Micro Agent
        run: npm install -g @builder.io/micro-agent

      - name: Run Micro Agent
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
        run: |
          micro-agent --file src/ \
            --prompt "Fix all failing tests" \
            --max-cost 1.0

      - name: Commit fixes
        run: |
          git config user.name "Micro Agent Bot"
          git config user.email "bot@builder.io"
          git add .
          git commit -m "fix: Auto-fix tests [skip ci]" || echo "No changes"
          git push
```

---

## Next Steps

- ✅ **Read the Python Tutorial**: [python.md](./python.md)
- ✅ **Read the Rust Tutorial**: [rust.md](./rust.md)
- ✅ **Explore Plugin System**: [quickstart.md](../specs/001-ralph-loop-2026/quickstart.md#plugin-system)
- ✅ **Architecture Deep Dive**: [plan.md](../specs/001-ralph-loop-2026/plan.md)

---

**Need Help?**
- 🐛 [GitHub Issues](https://github.com/BuilderIO/micro-agent/issues)
- 💬 [Discord Community](https://discord.gg/builderio)
- 📧 [Email Support](mailto:support@builder.io)

---

*Micro Agent - Powered by Ralph Loop 2026 methodology*
