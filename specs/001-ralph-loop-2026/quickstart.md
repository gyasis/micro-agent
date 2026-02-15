# Micro Agent - Quick Start Guide

This guide helps you get started with Micro Agent, the autonomous AI coding agent powered by Ralph Loop 2026 methodology (multi-agent iterative testing with fresh context resets).

> **Note:** "Ralph Loop 2026" is the name of the methodology/technique, not the product. The product is called "Micro Agent".

## Table of Contents

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Configuration](#configuration)
- [Plugin System](#plugin-system)
- [Testing Scenarios](#testing-scenarios)
- [Advanced Features](#advanced-features)

---

## Installation

```bash
# Install Micro Agent
npm install -g @builder.io/micro-agent

# Or use locally
npm install @builder.io/micro-agent --save-dev
```

### Prerequisites

- Node.js 18+ or 20+
- Docker (for sandboxed test execution)
- Git (for version control integration)

---

## Basic Usage

### Run Micro Agent interactively

```bash
# Run with interactive prompts
micro-agent

# Or use the short alias
ma
```

### Specify a file to fix

```bash
micro-agent --file src/utils/calculator.ts

# Or use the short form
ma --file src/utils/calculator.ts
```

**What happens during execution:**
1. 📚 **Librarian agent** (Gemini) analyzes your codebase
2. ✍️ **Artisan agent** (Claude) generates fixes
3. 🔎 **Critic agent** (GPT-4.1) reviews code quality
4. 🧪 **Test execution** using your framework (Vitest/Jest/pytest/cargo)
5. 💥 **Chaos agent** (Claude) runs adversarial tests
6. 🔄 **Fresh context reset** and iterate until tests pass or budget exhausted

---

## Configuration

### Basic Config (`ralph.config.yaml`)

```yaml
# Model assignments
models:
  librarian:
    provider: google
    model: gemini-2.0-pro
    temperature: 0.3

  artisan:
    provider: anthropic
    model: claude-sonnet-4.5
    temperature: 0.7

  critic:
    provider: openai
    model: gpt-4.1-mini
    temperature: 0.2

# Budget constraints
budgets:
  maxIterations: 30
  maxCostUsd: 2.0
  maxDurationMinutes: 15

# Testing strategies
testing:
  adversarialTests: true
  propertyBasedTests: true
  mutationTesting: true
  boundaryValueTesting: true

# Success criteria
successCriteria:
  testsPass: true
  adversarialTestsPass: true
  coverageThreshold: 90
  mutationScoreMin: 80
```

---

## Plugin System

Ralph Loop supports plugins to extend functionality at key lifecycle points.

### Plugin Configuration (`ralph-plugins.yaml`)

```yaml
plugins:
  # Local plugin (file path)
  - plugin: ./plugins/my-custom-plugin.js
    enabled: true
    config:
      settings:
        apiKey: ${SLACK_API_KEY}
        channel: '#ralph-notifications'
      timeout: 5000
      failOnError: false

  # npm package plugin
  - plugin: '@ralph/plugin-slack'
    enabled: true
    config:
      settings:
        webhookUrl: ${SLACK_WEBHOOK}
      hooks:
        onSuccess: true
        onTestFail: true
        onBudgetExceeded: false

  # Disabled plugin
  - plugin: '@ralph/plugin-analytics'
    enabled: false
```

### Plugin Discovery and Loading

Ralph Loop loads plugins in this order:

1. **Check for `ralph-plugins.yaml`** in current directory
2. **Parse YAML configuration**
3. **Load each plugin**:
   - Local files: Resolved relative to `ralph-plugins.yaml` location
   - npm packages: Loaded from `node_modules/`
4. **Validate plugin structure**:
   - Must export `RalphPlugin` interface
   - Must have `name` and `version` properties
   - Must implement at least one hook
5. **Initialize plugins**: Call `initialize()` if defined
6. **Register in plugin registry**: Enable/disable based on config

### Plugin File Structure

**Local plugin (`./plugins/my-plugin.js`):**

```javascript
// CommonJS
module.exports = {
  name: 'my-custom-plugin',
  version: '1.0.0',
  description: 'My awesome plugin',

  async initialize(config) {
    console.log('Plugin initialized with:', config.settings);
  },

  async onSuccess(context, results) {
    console.log(`✅ Iteration ${context.iteration} succeeded!`);
  },

  async cleanup() {
    console.log('Plugin cleaning up');
  }
};
```

**TypeScript plugin:**

```typescript
import type { RalphPlugin } from 'ralph-loop/plugin-sdk';

export const myPlugin: RalphPlugin = {
  name: 'my-typescript-plugin',
  version: '1.0.0',

  async onBeforeGen(context) {
    console.log('About to generate code for:', context.targetFile);
  },

  async onAfterGen(context, code) {
    console.log('Generated code:', code.filePath);
    // Custom validation logic
    if (code.code.includes('TODO')) {
      throw new Error('Generated code contains TODO comments');
    }
  }
};
```

### Available Lifecycle Hooks

| Hook | When | Use Cases |
|------|------|-----------|
| `onBeforeGen` | Before Artisan generates code | Add context, modify analysis |
| `onAfterGen` | After Artisan generates code | Validate code, run linters |
| `onTestFail` | After test failure | Send notifications, log analytics |
| `onBeforeSuccess` | Before marking iteration successful | Final validations, custom criteria |
| `onSuccess` | On iteration success | Notifications, cleanup |
| `onFailure` | On iteration failure | Rollback, error reporting |
| `onContextReset` | Before fresh context reset | Clear plugin state |
| `onBudgetExceeded` | When budget limit reached | Emergency save state |
| `onEntropyDetected` | When circuit breaker triggers | Custom recovery logic |

### Plugin Configuration Options

```yaml
plugins:
  - plugin: ./my-plugin.js
    enabled: true  # Enable/disable plugin
    config:
      settings:
        # Plugin-specific settings (passed to initialize)
        key: value

      timeout: 5000  # Hook execution timeout (ms)

      hooks:  # Enable/disable specific hooks
        onBeforeGen: true
        onAfterGen: true
        onTestFail: true
        onBeforeSuccess: false  # Skip this hook
        onSuccess: true

      failOnError: false  # If true, plugin error stops iteration
```

### Error Handling

Plugins are isolated from the main Ralph Loop execution:

- **Timeout Protection**: Hooks timeout after 5 seconds (configurable)
- **Error Isolation**: One plugin failure doesn't affect others
- **Graceful Degradation**: If all plugins fail, Ralph Loop continues
- **Logging**: All plugin errors logged to console with context

**Example error:**
```
❌ Hook failed: slack-notifier.onSuccess
  PluginError: Hook execution timed out after 5000ms
    at HookExecutor.executeWithTimeout
    Plugin: slack-notifier
    Hook: onSuccess
```

### Creating Custom Plugins

#### 1. Create Plugin File

```typescript
// plugins/linting-plugin.ts
import type { RalphPlugin, PluginContext, GeneratedCode } from 'ralph-loop/plugin-sdk';
import { ESLint } from 'eslint';

export const lintingPlugin: RalphPlugin = {
  name: 'eslint-linter',
  version: '1.0.0',
  description: 'Runs ESLint on generated code',

  async onAfterGen(context: PluginContext, code: GeneratedCode) {
    const eslint = new ESLint();
    const results = await eslint.lintText(code.code);

    const hasErrors = results.some(r => r.errorCount > 0);
    if (hasErrors) {
      throw new Error('ESLint found errors in generated code');
    }
  }
};
```

#### 2. Add to `ralph-plugins.yaml`

```yaml
plugins:
  - plugin: ./plugins/linting-plugin.ts
    enabled: true
    config:
      failOnError: true  # Block iteration if linting fails
```

#### 3. Install Dependencies

```bash
npm install eslint --save-dev
```

### Example Plugins

#### Slack Notifications

```typescript
export const slackPlugin: RalphPlugin = {
  name: 'slack-notifications',
  version: '1.0.0',

  async onSuccess(context, results) {
    await fetch(process.env.SLACK_WEBHOOK!, {
      method: 'POST',
      body: JSON.stringify({
        text: `✅ Ralph Loop succeeded after ${context.iteration} iterations!`
      })
    });
  },

  async onTestFail(context, failure) {
    await fetch(process.env.SLACK_WEBHOOK!, {
      method: 'POST',
      body: JSON.stringify({
        text: `❌ Test failed: ${failure.testName}\n${failure.errorMessage}`
      })
    });
  }
};
```

#### Analytics Tracking

```typescript
export const analyticsPlugin: RalphPlugin = {
  name: 'analytics',
  version: '1.0.0',

  async onSuccess(context, results) {
    await analytics.track({
      event: 'ralph_iteration_success',
      properties: {
        iteration: context.iteration,
        tokensUsed: results.tokensUsed,
        duration: results.duration,
        cost: results.cost
      }
    });
  }
};
```

---

## Testing Scenarios

### Scenario 1: Fix Failing Unit Tests

```bash
ralph-loop fix src/calculator.ts

# Ralph Loop will:
# 1. Read the test failures
# 2. Analyze the code
# 3. Generate fix
# 4. Run tests
# 5. Iterate until tests pass
```

### Scenario 2: Improve Test Coverage

```bash
ralph-loop improve-coverage src/utils/

# Generates additional tests to reach coverage threshold
```

### Scenario 3: Adversarial Testing

```bash
ralph-loop chaos src/api/auth.ts

# Runs:
# - Property-based tests (fast-check)
# - Mutation testing (Stryker)
# - Boundary value fuzzing
```

---

## Advanced Features

### Memory Vault

Ralph Loop remembers successful fixes:

```yaml
memory:
  vectorDb: chromadb
  embeddingModel: all-MiniLM-L6-v2
  similarityThreshold: 0.85
  maxPatterns: 1000
  contextResetFrequency: 1  # Fresh context every iteration
```

### Multi-Language Support

```yaml
languages:
  typescript:
    testPattern: '**/*.test.ts'
    coverageTool: c8

  python:
    testPattern: 'test_*.py'
    coverageTool: coverage

  rust:
    testPattern: '*_test.rs'
    coverageTool: cargo-tarpaulin
```

### Sandboxed Execution

```yaml
sandbox:
  type: docker
  memoryLimit: 2048m
  timeoutSeconds: 300
  networkMode: none  # Isolated from network
```

---

## Troubleshooting

### Plugin Not Loading

**Error:** `Plugin file not found`

**Solution:**
- Check file path is relative to `ralph-plugins.yaml`
- Verify file exists: `ls -la ./plugins/my-plugin.js`

**Error:** `Plugin must export default or named "plugin"`

**Solution:**
```javascript
// ✅ Correct
module.exports = { name: 'my-plugin', ... };
// or
export default { name: 'my-plugin', ... };

// ❌ Wrong
exports.myPlugin = { name: 'my-plugin', ... };
```

### Plugin Timeout

**Error:** `Hook execution timed out after 5000ms`

**Solution:**
```yaml
plugins:
  - plugin: ./slow-plugin.js
    config:
      timeout: 10000  # Increase to 10 seconds
```

### Plugin Failing Silently

Check logs for errors. By default, plugin failures are logged but don't crash Ralph Loop.

To make failures block execution:
```yaml
plugins:
  - plugin: ./critical-plugin.js
    config:
      failOnError: true
```

---

## Next Steps

- Read the [Plugin SDK Documentation](./contracts/plugin-sdk.d.ts)
- Explore [Example Plugins](../examples/plugins/)
- Join the [Ralph Loop Community](https://github.com/ralph-loop/ralph)
- Check out [Advanced Configuration](./plan.md)

---

**Need Help?**
- GitHub Issues: https://github.com/ralph-loop/ralph/issues
- Discord: https://discord.gg/ralph-loop
- Docs: https://ralph-loop.dev/docs
