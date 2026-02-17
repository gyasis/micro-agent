<br>
<div align="center">
   <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F4d36bc052c4340f997dd61eb19c1c64b">
      <img width="400" alt="Micro Agent logo" src="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F1a718d297d644fce90f33e93b7e4061f">
    </picture>
</div>

<p align="center">
   An AI agent that writes and fixes code for you.
</p>

<p align="center">
   <a href="https://www.npmjs.com/package/@builder.io/micro-agent"><img src="https://img.shields.io/npm/v/@builder.io/micro-agent" alt="Current version"></a>
</p>

# Micro Agent

> **Now powered by Ralph Loop 2026 techniques** - Multi-agent architecture with fresh context resets, intelligent memory learning, and adversarial testing

An autonomous AI coding agent that iteratively writes and fixes code until all tests pass. Micro Agent uses the Ralph Loop 2026 methodology: multiple specialized AI agents (Librarian, Artisan, Critic, Chaos) working together with fresh context every iteration to prevent token waste and context pollution.

## ✨ Key Features

- 🤖 **Multi-Agent Architecture**: Librarian (Gemini), Artisan (Claude), Critic (GPT-4.1), Chaos (Claude)
- 🔄 **Fresh Context Every Iteration**: Prevents context pollution and eliminates token waste
- 🧠 **Intelligent Memory Vault**: Vector database learns from past fixes using semantic similarity
- 🎯 **Adversarial Testing**: Property-based tests, mutation testing, boundary fuzzing
- 🌍 **Polyglot Support**: TypeScript, JavaScript, Python, Rust
- 🔌 **Plugin System**: Extend with custom lifecycle hooks (10 hook points)
- 💰 **Budget-Aware**: Automatic cost tracking with configurable limits
- 🛡️ **Sandboxed Execution**: Isolated test runs in Docker containers
- ⚡ **Circuit Breaker**: Entropy detection prevents infinite loops

## 🚀 Quick Start

### Installation

```bash
# Global installation
npm install -g @builder.io/micro-agent

# Or use locally
npm install @builder.io/micro-agent --save-dev
```

### Basic Usage

```bash
# Run micro-agent interactively
micro-agent

# Or use the short alias
ma

# Fix a specific file
micro-agent --file src/utils/calculator.ts

# Specify a custom prompt
micro-agent --prompt "Add error handling to the login function"
```

### Example Output

```
🤖 Micro Agent - Multi-Agent Iterative Testing (Ralph Loop 2026)
   Session: abc123, Budget: 30 iterations, $2.00 max

🔍 Iteration 1/30
   📚 Librarian (Gemini): Analyzed 3 files, found 12 dependencies
   ✍️  Artisan (Claude): Generated fix for TypeError at line 42
   🔎 Critic (GPT-4.1): Code quality 85/100, suggested 2 improvements
   🧪 Tests: 8/10 passed (2 failures)
   💥 Chaos: Skipped (tests didn't pass)

🔍 Iteration 2/30 (Fresh Context Reset)
   ✍️  Artisan: Improved error handling based on memory vault
   🧪 Tests: 10/10 passed ✅
   💥 Chaos: Running adversarial tests...
      - Property tests: 15/15 passed
      - Mutation score: 85% (17/20 killed)
      - Boundary tests: 12/12 passed

🎉 SUCCESS! Tests pass + Chaos tests complete
   💰 Cost: $0.23  |  ⏱️  Duration: 45s  |  🔄 Iterations: 2
   💾 Fix pattern saved to memory vault
```

## 🔬 What is Ralph Loop 2026?

Ralph Loop 2026 is the **methodology** that powers Micro Agent. It's named after the iterative testing approach where:

1. **Fresh Context Reset** - Each iteration destroys and recreates the AI context to prevent pollution
2. **Multi-Agent Collaboration** - Specialized agents (Librarian, Artisan, Critic, Chaos) work together
3. **Intelligent Memory** - Vector database learns from past mistakes across sessions
4. **Circuit Breaker** - Entropy detection stops infinite loops after 3 identical errors
5. **Budget Awareness** - Automatic tracking prevents runaway costs

Think of it as **TDD (Test-Driven Development) meets AI agents meets fresh context resets**.

## 📖 Documentation

- **[Quick Start Guide](./specs/001-ralph-loop-2026/quickstart.md)** - Get started in 5 minutes
- **[Configuration Guide](#configuration)** - Customize models and settings
- **[Plugin System](./specs/001-ralph-loop-2026/quickstart.md#plugin-system)** - Extend functionality
- **[Architecture](./specs/001-ralph-loop-2026/plan.md)** - Technical deep dive into Ralph Loop 2026

## ⚙️ Configuration

Create `ralph.config.yaml` in your project root:

```yaml
# AI Model Assignments
models:
  librarian:
    provider: google
    model: gemini-2.0-pro
    temperature: 0.3  # Low temp for precise analysis

  artisan:
    provider: anthropic
    model: claude-sonnet-4.5
    temperature: 0.7  # Moderate temp for code generation

  critic:
    provider: openai
    model: gpt-4.1-mini
    temperature: 0.2  # Low temp for strict review

  chaos:
    provider: anthropic
    model: claude-sonnet-4.5
    temperature: 0.9  # High temp for creative adversarial thinking

# Budget Constraints
budgets:
  maxIterations: 30
  maxCostUsd: 2.0
  maxDurationMinutes: 15

# Testing Strategies
testing:
  adversarialTests: true
  propertyBasedTests: true
  mutationTesting: true
  boundaryValueTesting: true

# Success Criteria
successCriteria:
  testsPass: true
  adversarialTestsPass: true
  coverageThreshold: 90
  mutationScoreMin: 80

# Memory & Learning
memory:
  vectorDb: chromadb
  similarityThreshold: 0.85
  maxPatterns: 1000
  contextResetFrequency: 1  # GOLD STANDARD: Fresh context every iteration
```

### Environment Variables

Ralph Loop 2026 supports **6 LLM providers** via direct SDK integration:

```bash
# 1. Anthropic Claude (REQUIRED for Artisan & Chaos agents)
export ANTHROPIC_API_KEY=sk-ant-...
# Get key: https://console.anthropic.com/

# 2. Google Gemini (REQUIRED for Librarian agent)
export GOOGLE_API_KEY=...
# Get key: https://aistudio.google.com/app/apikey

# 3. OpenAI (REQUIRED for Critic agent)
export OPENAI_API_KEY=sk-...
# Get key: https://platform.openai.com/api-keys

# 4. Azure OpenAI (Optional - alternative to OpenAI)
export AZURE_OPENAI_KEY=...
export AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
# Get credentials: https://portal.azure.com/

# 5. Hugging Face (Optional - 70k+ specialized models)
export HUGGINGFACE_API_KEY=hf_...
# Get key: https://huggingface.co/settings/tokens

# 6. Ollama (Optional - 100+ local models, FREE)
# No API key required! Install from: https://ollama.com/
export OLLAMA_BASE_URL=http://localhost:11434
```

**Cost Optimization Tips:**
- Use **Gemini 2.0 Flash** instead of Pro (10x cheaper, faster)
- Use **GPT-4.1-mini** instead of GPT-4 (300x cheaper!)
- Use **Ollama** for free local models (llama3, phi, mistral, qwen, deepseek)
- Default config already uses cost-optimized models

## 🏗️ Architecture

### Multi-Agent State Machine

```mermaid
graph TD
    A[Librarian] -->|Context & Dependencies| B[Artisan]
    B -->|Generated Code| C[Critic]
    C -->|Approved Code| D[Testing]
    D -->|Tests Pass| E[Adversarial]
    D -->|Tests Fail| F[Next Iteration]
    E -->|Complete| G[Success]
    F -->|Destroy Machine| A
```

**Agents**:
- **Librarian (Gemini)**: Context analysis, dependency graphing, file ranking
- **Artisan (Claude)**: Code generation and fixes with 0.7 temperature
- **Critic (GPT-4.1)**: Code quality review, logic verification
- **Chaos (Claude)**: Adversarial testing with 0.9 temperature

### Fresh Context Reset (GOLD STANDARD)

Every iteration destroys the previous state machine and creates a fresh one:

```typescript
for (let iteration = 0; iteration < maxIterations; iteration++) {
  // Create fresh state machine
  const machine = createRalphMachine(sessionId, iteration, targetFile, config);

  // Execute iteration
  const result = await executeMachine(machine);

  if (result.success) {
    await memoryVault.storeFixPattern(result.fix);
    break;
  }

  // Machine is destroyed - fresh context for next iteration
  // No context pollution, no token waste
}
```

**Benefits**:
- ✅ No context pollution across iterations
- ✅ Prevents cascading errors from bad state
- ✅ Each iteration starts with clean slate
- ✅ Optimal token usage (only pay for what you need)

### Memory Vault Learning

```typescript
// Store successful fix
await memoryVault.storeFixPattern({
  errorSignature: '[LOGIC] expected 5 but got 3',
  solution: 'Changed += to = in accumulator',
  context: ['calculator.ts', 'sum function'],
  successRate: 1.0,
  timesApplied: 1
});

// Retrieve similar fixes using vector similarity
const fixes = await similaritySearch.search({
  errorMessage: 'expected 10 but got 8',
  context: ['calculator.ts']
});
// Returns top 5 most similar past fixes with relevance scores
```

**Similarity Scoring**:
- Category match: 30% weight
- Context overlap (Jaccard): 50% weight
- Recency (exponential decay): 20% weight
- Bonuses: success rate >80% (+10%), popularity >5 uses (+5%)

## 🎯 Use Cases

### 1. Fix Failing Tests

```bash
micro-agent --file src/api/auth.ts

# Micro Agent will:
# 1. Analyze test failures (Librarian)
# 2. Search memory for similar fixes
# 3. Generate and apply fix (Artisan)
# 4. Review code quality (Critic)
# 5. Verify tests pass
# 6. Run adversarial tests (Chaos)
# 7. Store successful pattern
```

### 2. Improve Test Coverage

```bash
micro-agent --file src/utils/ --prompt "Improve test coverage to 90%"

# Generates additional tests to reach 90% coverage
```

### 3. Adversarial Testing Only

```bash
micro-agent --file src/critical-module.ts --prompt "Run adversarial tests only"

# Runs:
# - Property-based tests (fast-check)
# - Mutation testing (Stryker)
# - Boundary value fuzzing
# - Reports survived mutations
```

### 4. Continuous Integration

```yaml
# .github/workflows/micro-agent.yml
name: Micro Agent CI
on: [push, pull_request]

jobs:
  micro-agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install -g @builder.io/micro-agent
      - run: micro-agent --file src/ --prompt "Fix all failing tests" --max-cost 1.0
```

## 🔌 Plugin System

Extend Micro Agent with custom lifecycle hooks (powered by Ralph Loop engine):

```typescript
// plugins/slack-notifier.ts
import type { RalphPlugin } from '@builder.io/micro-agent/plugin-sdk';

export const slackPlugin: RalphPlugin = {
  name: 'slack-notifications',
  version: '1.0.0',

  async onSuccess(context, results) {
    await fetch(process.env.SLACK_WEBHOOK!, {
      method: 'POST',
      body: JSON.stringify({
        text: `✅ Iteration ${context.iteration} succeeded in ${results.duration}s!`
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
  },

  async onBudgetExceeded(context, budget) {
    await fetch(process.env.SLACK_WEBHOOK!, {
      method: 'POST',
      body: JSON.stringify({
        text: `⚠️ Budget exceeded: ${budget.exceeded} limit reached`
      })
    });
  }
};
```

**Configuration (`ralph-plugins.yaml`):**

```yaml
plugins:
  - plugin: ./plugins/slack-notifier.ts
    enabled: true
    config:
      timeout: 5000
      failOnError: false
      hooks:
        onSuccess: true
        onTestFail: true
        onBudgetExceeded: true
```

**10 Lifecycle Hooks**: `onBeforeGen`, `onAfterGen`, `onTestFail`, `onBeforeSuccess`, `onSuccess`, `onFailure`, `onContextReset`, `onBudgetExceeded`, `onEntropyDetected`, `initialize/cleanup`

## 🧪 Language Support

| Language   | Test Framework      | Coverage Tool    | Status |
|------------|---------------------|------------------|--------|
| TypeScript | Vitest, Jest        | c8, Istanbul     | ✅     |
| JavaScript | Vitest, Jest        | c8, Istanbul     | ✅     |
| Python     | pytest              | coverage.py      | ✅     |
| Rust       | cargo test          | cargo-tarpaulin  | ✅     |
| Go         | go test             | go cover         | 🚧     |
| Java       | JUnit               | JaCoCo           | 🚧     |

## 💡 Advanced Features

### Circuit Breaker (Entropy Detection)

Automatically stops when detecting repeating errors:

```yaml
budgets:
  maxIterations: 30  # Hard limit

# Entropy detection:
# - If same error signature appears 3+ times → circuit breaker triggers
# - Adversarial failures DON'T count toward entropy
# - Prevents infinite loops on unsolvable problems
```

### Budget Tracking

Real-time budget monitoring:

```typescript
{
  iterations: { current: 5, max: 30 },
  cost: { current: 0.45, max: 2.0 },
  duration: { current: 120, max: 900 }
}

// Stops when ANY limit is exceeded
```

### Intelligent Backtracking

For adversarial test failures:
- ✅ Unit tests pass → ✅ Code is working
- ⚠️ Adversarial tests fail → Informational only
- System proceeds to completion
- Adversarial failures are logged but don't block success
- Doesn't count toward entropy threshold

## 📊 Metrics & Analytics

Ralph Loop tracks:
- **Tokens Used**: Per agent, per iteration, cumulative
- **Cost**: Real-time calculation with provider-specific pricing
- **Duration**: Wall-clock time per iteration and total
- **Success Rate**: Fix pattern success rate over time
- **Coverage**: Code coverage percentage
- **Mutation Score**: Test quality metric (killed/total mutations)
- **Context Usage**: Token usage per agent (with 40% reset threshold)

## 🛠️ Development

### Build from Source

```bash
git clone https://github.com/BuilderIO/micro-agent.git
cd micro-agent
npm install
npm run build
```

### Run Tests

```bash
npm test                 # Unit tests
npm run test:integration # Integration tests
npm run test:e2e        # End-to-end tests
npm run test:chaos      # Chaos/adversarial tests
```

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

**Areas for Contribution**:
- 🌐 Additional language support (Go, Java, C++)
- 🔌 Community plugins
- 📚 Documentation improvements
- 🐛 Bug fixes
- ✨ Feature requests

## 📄 License

MIT License - see [LICENSE](./LICENSE)

## 🙏 Acknowledgments

Built on the shoulders of giants:
- **Anthropic Claude** - Code generation and chaos testing
- **Google Gemini** - Context analysis and dependency graphing
- **OpenAI GPT** - Code review and quality assurance
- **ChromaDB** - Vector similarity search for memory vault
- **XState** - State machine orchestration
- **Stryker** - Mutation testing framework
- **fast-check** - Property-based testing library

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/BuilderIO/micro-agent/issues)
- 💬 **Discord**: [Builder.io Community](https://discord.gg/builderio)
- 📧 **Email**: support@builder.io
- 📖 **Docs**: See [specs/001-ralph-loop-2026/](./specs/001-ralph-loop-2026/) for technical documentation

## 🗺️ Roadmap

- [ ] Real-time collaboration mode (multiple developers)
- [ ] Web dashboard for monitoring iterations
- [ ] VS Code extension with inline suggestions
- [ ] More language support (Go, Java, C++, Swift)
- [ ] Cloud-hosted memory vault sharing
- [ ] Advanced analytics dashboard
- [ ] Integration with GitHub Copilot
- [ ] Self-hosted LLM support (Llama, Mistral)

---

**Built with ❤️ by the Ralph Loop team**

*Making AI-powered testing accessible and reliable for everyone*

> **Note**: This project evolved from [Micro Agent](https://github.com/BuilderIO/micro-agent) by Builder.io, reimagined with multi-agent architecture, fresh context resets, and intelligent memory learning.
