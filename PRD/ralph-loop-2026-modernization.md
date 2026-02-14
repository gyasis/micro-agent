# Ralph Loop 2026 Modernization - Product Requirements Document

**Version:** 1.0
**Date:** February 12, 2026
**Status:** Draft
**Author:** SuperClaude + Gemini Deep Research

---

## Executive Summary

This PRD outlines the modernization of the micro-agent project's iterative testing loop into a sophisticated 2026 "Ralph Loop" architecture. The upgrade transforms the current linear retry mechanism into a multi-agent state machine with adversarial testing, multi-LLM orchestration, native polyglot testing support, and intelligent error handling.

**Current State:** Simple loop with max 20 iterations, single LLM, basic test retry
**Target State:** Self-healing development lifecycle with adversarial testing, multi-model consensus, and contract-based completion

---

## 1. Problem Statement

### Current Limitations
1. **Naive Retry Logic:** Simple counter-based loop without learning from failures
2. **Single Model Dependency:** Only uses one LLM (Claude or GPT), no specialization
3. **Test-Only Validation:** No adversarial testing or edge case discovery
4. **Generic Error Handling:** Doesn't categorize or learn from error patterns
5. **Hard Exit:** Fixed max iterations without intelligent completion criteria
6. **Language-Agnostic Testing:** Doesn't leverage native testing framework features

### Market Context (2026)
- Ralph Wiggum technique is now industry standard (Anthropic official plugin)
- Multi-agent architectures outperform single-agent by 40% (Vercel AI SDK benchmarks)
- Adversarial testing is standard practice for AI-generated code
- Polyglot development requires native toolchain awareness

---

## 2. Goals & Success Metrics

### Primary Goals
1. **Increase Success Rate:** 85% → 95% test pass rate within budget
2. **Reduce Token Cost:** 30% reduction via specialized model routing
3. **Discover More Bugs:** 3x edge case detection via adversarial agents
4. **Multi-Language Support:** Native testing for TS/JS/Python/Rust

### Success Metrics
- **KPI 1:** Code generated passes adversarial tests 90% of the time
- **KPI 2:** Average cost per successful run < $0.50
- **KPI 3:** User satisfaction score > 4.5/5
- **KPI 4:** Support for 4+ languages with native test frameworks

---

## 3. Architecture Overview

### 3.1 Core Principles

**From Linear Loop → Multi-Agent State Machine**

```
┌─────────────────────────────────────────────────────────┐
│                    Ralph Loop 2026                      │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐   ┌───────────┐ │
│  │   Librarian  │───▶│   Artisan    │──▶│   Critic  │ │
│  │   (Gemini)   │    │   (Claude)   │   │   (GPT)   │ │
│  │  Context     │    │   Code Gen   │   │   Review  │ │
│  └──────────────┘    └──────────────┘   └───────────┘ │
│         │                    │                  │      │
│         └────────────────────┴──────────────────┘      │
│                              ▼                         │
│                   ┌─────────────────┐                  │
│                   │  Adversarial    │                  │
│                   │  Bug Hunter     │                  │
│                   │  (Chaos Agent)  │                  │
│                   └─────────────────┘                  │
│                              ▼                         │
│                   ┌─────────────────┐                  │
│                   │  Native Test    │                  │
│                   │  Runner         │                  │
│                   │  (Polyglot)     │                  │
│                   └─────────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Agent Specialization

#### The Librarian (Gemini 1.5/2.0 Pro)
- **Role:** Global context provider with 1M+ token window
- **Responsibilities:**
  - Ingest entire codebase on startup
  - Build dependency graph
  - Provide historical context for errors
  - Maintain vector database of past solutions
- **When Used:** Pre-generation phase, error analysis

#### The Artisan (Claude Sonnet 4.5)
- **Role:** Primary code generator
- **Responsibilities:**
  - Write idiomatic code following language best practices
  - Implement fixes based on Librarian's context
  - Follow completion promise contract
- **When Used:** Code generation phase

#### The Critic (GPT-4.1 or Gemini Pro)
- **Role:** Logic verification and reasoning
- **Responsibilities:**
  - Chain-of-thought review of generated code
  - Identify logical flaws before test execution
  - Validate edge case handling
- **When Used:** Post-generation, pre-test phase

#### The Chaos Agent (Adversarial Bug Hunter)
- **Role:** Adversarial tester
- **Responsibilities:**
  - Generate property-based tests
  - Create fuzzing inputs (null bytes, max integers, race conditions)
  - Run mutation testing (Stryker for TS/JS, mutmut for Python)
  - Challenge architectural decisions
- **When Used:** After initial tests pass

#### The Local Guard (Optional - Llama 4/Mistral)
- **Role:** Privacy and sanity checks
- **Responsibilities:**
  - PII masking before API calls
  - Syntax linting
  - Cost estimation
- **When Used:** Pre-generation phase

---

## 4. Technical Specifications

### 4.1 Polyglot Testing Framework Support

#### TypeScript/JavaScript
```yaml
framework_detection:
  - package.json exists
  - scripts.test contains: jest|vitest|mocha|ava

native_features:
  - Coverage reporting (c8, nyc)
  - Snapshot testing
  - Watch mode for rapid iteration

test_runner_adapter:
  command: npm test
  parser: JestReporter
  output_format: ralph-test-json
```

#### Python
```yaml
framework_detection:
  - pyproject.toml or requirements.txt exists
  - pytest or unittest imports

native_features:
  - Pytest fixtures
  - Hypothesis property testing
  - Coverage.py integration

test_runner_adapter:
  command: pytest --json-report
  parser: PytestReporter
  output_format: ralph-test-json
```

#### Rust
```yaml
framework_detection:
  - Cargo.toml exists
  - #[cfg(test)] annotations

native_features:
  - Cargo test
  - Benchmark tests (criterion)
  - Doc tests

test_runner_adapter:
  command: cargo test --message-format=json
  parser: CargoTestReporter
  output_format: ralph-test-json
```

#### Universal Test Schema (ralph-test-json)
```typescript
interface RalphTestResult {
  status: 'pass' | 'fail' | 'skip' | 'timeout';
  test_name: string;
  duration_ms: number;
  error?: {
    type: 'syntax' | 'logic' | 'runtime' | 'assertion' | 'timeout';
    message: string;
    stack_trace: StackFrame[];
    source_location: { file: string; line: number; column: number };
  };
  coverage?: {
    line_coverage: number;
    branch_coverage: number;
  };
  stdout?: string;
  stderr?: string;
}
```

### 4.2 Intelligent Error Handling System

#### Error Categorization
```typescript
enum ErrorCategory {
  SYNTAX = 'syntax',           // Parse/compile errors
  LOGIC = 'logic',             // Wrong output, failed assertions
  ENVIRONMENT = 'environment', // Missing deps, wrong Node version
  FLAKY = 'flaky',             // Intermittent failures (race conditions)
  PERFORMANCE = 'performance', // Timeout, memory issues
}

interface ErrorPattern {
  category: ErrorCategory;
  signature: string;  // Normalized error message
  frequency: number;  // How often this error occurs
  fixes: FixAttempt[];
  success_rate: number;
}
```

#### Memory Vault (Vector Fix-Log)
```typescript
interface FixAttempt {
  error_signature: string;
  hypothesis: string;  // "I believe this failed because..."
  action_taken: string;
  success: boolean;
  timestamp: Date;
  cost_tokens: number;
}

class MemoryVault {
  private db: VectorDB;  // ChromaDB or LanceDB

  async queryPastFixes(error: RalphTestResult): Promise<FixAttempt[]> {
    const embedding = await embedError(error);
    return this.db.similaritySearch(embedding, k=5);
  }

  async recordFix(attempt: FixAttempt): Promise<void> {
    await this.db.insert(attempt);
  }
}
```

### 4.3 Completion Promise Pattern (Definition of Done)

#### Contract-Based Exit
```yaml
# ralph.config.yaml
success_criteria:
  required:
    - tests_pass: true
    - adversarial_tests_pass: true

  optional:
    - coverage_threshold: 90%
    - linter_errors: 0
    - complexity_score: { max: 10 }
    - performance_regression: { max_slowdown: 1.2 }

  budgets:
    max_iterations: 30
    max_cost_usd: 2.00
    max_duration_minutes: 15

  circuit_breaker:
    # Stop if making same mistake 3 times
    entropy_threshold: 3
    pause_and_ask_human: true
```

#### Exit Conditions
```typescript
interface CompletionPromise {
  evaluate(results: TestResults, metrics: Metrics): CompletionStatus;
}

type CompletionStatus =
  | { status: 'success'; iterations: number; cost: number }
  | { status: 'budget_exceeded'; reason: string }
  | { status: 'entropy_detected'; stuck_on: string }
  | { status: 'max_iterations'; last_error: string };
```

### 4.4 Adversarial Testing Strategies

#### Chaos Monkey Agent
```typescript
class ChaosMonkeyAgent {
  async generateEvilTests(code: string, lang: Language): Promise<string> {
    const strategies = [
      this.propertyBasedTests,    // fast-check for TS, Hypothesis for Python
      this.boundaryValueAnalysis, // null, undefined, 0, MAX_INT, empty string
      this.raceConditionTests,    // async/await edge cases
      this.mutationTesting,       // Stryker, mutmut
    ];

    return Promise.all(strategies.map(s => s(code, lang)));
  }

  async propertyBasedTests(code: string): Promise<string> {
    // Use LLM to generate property invariants
    // Example: "For all valid inputs, output should be non-null"
  }
}
```

#### Mutation Testing Integration
```typescript
interface MutationTestResult {
  mutations_generated: number;
  mutations_killed: number;  // Tests detected the mutation
  mutation_score: number;    // killed/generated
  weak_tests: TestCase[];    // Tests that didn't catch mutations
}

// Ralph should reject code if mutation score < 80%
```

### 4.5 Plugin Architecture

#### Event-Driven Hooks
```typescript
interface RalphPlugin {
  name: string;
  version: string;

  hooks: {
    onBeforeGen?(context: Context): Promise<void>;
    onAfterGen?(code: string): Promise<string>;
    onTestFail?(error: TestError): Promise<void>;
    onSuccess?(results: Results): Promise<void>;
  };
}

// Example Plugin: Auto-Documentation
class DocGenPlugin implements RalphPlugin {
  name = 'auto-docs';

  async onSuccess(results: Results) {
    const readme = await generateReadme(results.code);
    await fs.writeFile('README.md', readme);
  }
}
```

#### Plugin Registry
```typescript
// ralph-plugins.yaml
plugins:
  - name: '@ralph/prettier'
    enabled: true
    config:
      on: onAfterGen

  - name: '@ralph/security-scan'
    enabled: true
    config:
      on: onBeforeSuccess
      tools: [semgrep, snyk]

  - name: '@ralph/benchmark'
    enabled: false
    config:
      on: onSuccess
      baseline_file: .ralph/benchmarks.json
```

---

## 5. Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
**Goal:** Refactor from linear loop to state machine

**Tasks:**
- [ ] Install XState for state management
- [ ] Define state machine transitions
- [ ] Create agent interface abstractions
- [ ] Implement ralph-test-json schema
- [ ] Add SQLite for MemoryVault

**Deliverables:**
- State machine diagram
- Agent interface (`IAgent`)
- Test result parser for TS/JS

### Phase 2: Multi-LLM Orchestration (Week 3-4)
**Goal:** Implement The Council of Models

**Tasks:**
- [ ] Add Gemini API integration (Librarian)
- [ ] Keep Claude for code generation (Artisan)
- [ ] Add GPT-4.1 for review (Critic)
- [ ] Implement model routing logic
- [ ] Add cost tracking per model

**Deliverables:**
- Multi-model orchestration working
- Cost breakdown by agent
- Performance benchmarks vs single model

### Phase 3: Polyglot Testing (Week 5-6)
**Goal:** Support Python and Rust

**Tasks:**
- [ ] Implement pytest adapter
- [ ] Implement cargo test adapter
- [ ] Create manifest detection system
- [ ] Add Docker/WebContainer sandbox
- [ ] Test on sample projects

**Deliverables:**
- Python test suite passing
- Rust test suite passing
- Sandbox security validated

### Phase 4: Adversarial Testing (Week 7-8)
**Goal:** Add Chaos Monkey Agent

**Tasks:**
- [ ] Integrate fast-check (TS property testing)
- [ ] Integrate Hypothesis (Python property testing)
- [ ] Add mutation testing (Stryker)
- [ ] Implement boundary value generator
- [ ] Add race condition detector

**Deliverables:**
- Adversarial test generator
- Mutation score reporting
- 3x increase in edge case detection

### Phase 5: Memory & Learning (Week 9-10)
**Goal:** Implement MemoryVault

**Tasks:**
- [ ] Set up vector database (ChromaDB)
- [ ] Create error embedding pipeline
- [ ] Implement hypothesis-driven debugging
- [ ] Add entropy detection (circuit breaker)
- [ ] Build fix recommendation engine

**Deliverables:**
- Vector search for past fixes working
- Entropy detection preventing loops
- 30% faster resolution of repeated errors

### Phase 6: Plugin System (Week 11-12)
**Goal:** Make Ralph extensible

**Tasks:**
- [ ] Design plugin API
- [ ] Implement hook system
- [ ] Create plugin registry
- [ ] Build 3 example plugins (docs, security, benchmark)
- [ ] Publish plugin SDK

**Deliverables:**
- Plugin SDK documentation
- Plugin marketplace (npm)
- Community plugin contributions

---

## 6. User Experience

### 6.1 CLI Interface (Enhanced)

#### Current Command
```bash
micro-agent ./file.ts -t "npm test" -m 20
```

#### New Command (2026)
```bash
ralph-loop ./file.ts \
  --config ralph.config.yaml \
  --adversarial \
  --models librarian=gemini,artisan=claude,critic=gpt \
  --budget $2.00 \
  --ui
```

#### Interactive UI (Web Dashboard)
```
┌─────────────────────────────────────────────────┐
│  Ralph Loop 2026 - Live Dashboard              │
├─────────────────────────────────────────────────┤
│  Status: 🔄 In Progress                         │
│  Iteration: 7/30                                │
│  Cost: $0.43 / $2.00                            │
│  Duration: 2m 34s                               │
├─────────────────────────────────────────────────┤
│  Current Phase: Adversarial Testing             │
│                                                 │
│  Thought Stream:                                │
│  💭 Librarian: Analyzing error pattern...       │
│  💭 Artisan: Generating fix for null pointer... │
│  💭 Critic: Edge case detected in async block   │
│  💭 Chaos: Fuzzing with max integer...          │
│                                                 │
│  [Nudge Agent] "Try using a RegEx instead"      │
├─────────────────────────────────────────────────┤
│  Test Results:                                  │
│  ✅ Unit tests: 24/24 passing                   │
│  ⏳ Adversarial: 12/20 passing                  │
│  📊 Coverage: 87% (target: 90%)                 │
│  🧬 Mutation Score: 76% (target: 80%)           │
└─────────────────────────────────────────────────┘
```

### 6.2 Success Output

```bash
╭──────────────────────────────────────────────╮
│  🎉 Ralph Loop Complete!                     │
╰──────────────────────────────────────────────╯

✅ All Tests Passed
✅ Adversarial Tests Passed (20/20)
✅ Coverage: 92% (target: 90%)
✅ Mutation Score: 83% (target: 80%)
✅ Linter: 0 errors
✅ Performance: No regression detected

📊 Summary:
   Iterations: 12
   Duration: 4m 23s
   Cost: $0.67

🧠 Agents Used:
   Librarian (Gemini): 2 calls, $0.15
   Artisan (Claude): 12 calls, $0.45
   Critic (GPT): 3 calls, $0.07

💾 Memory Vault:
   New patterns learned: 3
   Past fixes referenced: 5

📝 Next Steps:
   ✓ Code committed to git
   ✓ README.md updated
   ✓ Benchmarks saved to .ralph/
```

---

## 7. Configuration Reference

### ralph.config.yaml
```yaml
# Ralph Loop 2026 Configuration

# Model Orchestration
models:
  librarian:
    provider: gemini
    model: gemini-2.0-pro
    temperature: 0.3

  artisan:
    provider: anthropic
    model: claude-sonnet-4.5
    temperature: 0.7

  critic:
    provider: openai
    model: gpt-4.1-mini
    temperature: 0.5

  local_guard:
    enabled: false
    provider: ollama
    model: llama4

# Language Configuration
languages:
  typescript:
    test_framework: vitest
    test_pattern: "**/*.test.ts"
    coverage_tool: c8

  python:
    test_framework: pytest
    test_pattern: "**/test_*.py"
    coverage_tool: coverage

  rust:
    test_framework: cargo
    test_pattern: "tests/"

# Testing Strategy
testing:
  unit_tests: required
  adversarial_tests: true
  mutation_testing: true
  property_based: true

# Success Criteria
success_criteria:
  tests_pass: true
  adversarial_tests_pass: true
  coverage_threshold: 90
  mutation_score_min: 80
  linter_errors: 0

# Budgets
budgets:
  max_iterations: 30
  max_cost_usd: 2.00
  max_duration_minutes: 15

# Memory & Learning
memory:
  enabled: true
  vector_db: chromadb
  similarity_threshold: 0.85
  max_history: 1000

# Plugins
plugins:
  - "@ralph/prettier"
  - "@ralph/security-scan"
  - "@ralph/benchmark"

# Sandbox
sandbox:
  type: docker  # or webcontainer
  timeout_seconds: 300
  memory_limit_mb: 2048
```

---

## 8. Technical Debt & Considerations

### Security
- **Sandbox Escape Prevention:** All code execution in Docker/WebContainer
- **API Key Protection:** Local Guard masks sensitive data before API calls
- **Dependency Scanning:** Snyk/Semgrep integration via plugins

### Performance
- **Token Optimization:** Vector DB cache reduces redundant context
- **Parallel Testing:** Run unit + adversarial tests concurrently
- **Local Model Option:** Llama 4 for offline/fast operations

### Scalability
- **Distributed Agents:** Future support for multi-machine orchestration
- **Cloud Deployment:** Ralph as a service (hosted version)
- **Team Collaboration:** Shared MemoryVault across team

---

## 9. Success Criteria & KPIs

### Launch Criteria (MVP)
- [ ] Multi-LLM orchestration working (3 agents minimum)
- [ ] TypeScript + Python support
- [ ] Adversarial testing integration
- [ ] MemoryVault storing 100+ fix patterns
- [ ] Documentation complete
- [ ] 95% test coverage on Ralph codebase itself

### Post-Launch KPIs (3 months)
- [ ] 10,000+ npm downloads
- [ ] User satisfaction > 4.5/5
- [ ] Average success rate > 95%
- [ ] Cost per run < $0.50
- [ ] 50+ community plugins published

---

## 10. Open Questions

1. **Q:** Should we support Azure OpenAI endpoints for enterprise?
   **A:** Yes, add `azure_openai_endpoint` config option (Week 4)

2. **Q:** How to handle API rate limits across multiple models?
   **A:** Implement exponential backoff + model fallback (Gemini → Claude → GPT)

3. **Q:** Should Ralph auto-commit to git after success?
   **A:** Make it optional via `auto_commit: true` in config

4. **Q:** How to prevent infinite loops in adversarial testing?
   **A:** Circuit breaker after 3 identical mutations

---

## 11. Appendix

### A. Related Research
- [Ralph Wiggum Technique Research](./research_reports/2026-02/ralph_wiggum_multihop_research_d3bc2ff1_20260212_184544.md)
- [Anthropic Ralph Plugin Documentation](https://awesomeclaude.ai/ralph-wiggum)
- [Gemini Brainstorming Output](#) (see tool response above)

### B. Competitive Analysis
| Feature | micro-agent (current) | Cursor | Copilot Workspace | Ralph Loop 2026 |
|---------|----------------------|--------|-------------------|-----------------|
| Multi-LLM | ❌ | ❌ | ✅ | ✅ |
| Adversarial Testing | ❌ | ❌ | ❌ | ✅ |
| Polyglot Support | ⚠️ (basic) | ✅ | ✅ | ✅ |
| Memory/Learning | ❌ | ⚠️ | ⚠️ | ✅ |
| Plugin System | ❌ | ✅ | ❌ | ✅ |
| Cost per run | $0.30 | $0.50 | $1.00 | $0.50 |

### C. Technical Stack Summary
```yaml
runtime: Node.js 20+
language: TypeScript 5.0+
state_mgmt: XState
llm_abstraction: LiteLLM (unified interface for 100+ providers)
vector_db: ChromaDB / LanceDB
llm_providers:
  - Anthropic (Claude via LiteLLM)
  - Google (Gemini via LiteLLM)
  - OpenAI (GPT via LiteLLM)
  - Ollama (Local models via LiteLLM)
  - Azure OpenAI (via LiteLLM)
testing:
  - Vitest (TS/JS)
  - Pytest (Python)
  - Cargo (Rust)
sandbox: Docker / WebContainers
ui: React + Vite (optional web dashboard)
```

**Key Architecture Decision: LiteLLM**

We use **LiteLLM** as the unified abstraction layer for all LLM providers. This provides:
- Single API for 100+ models (GPT, Claude, Gemini, Ollama, Azure, Bedrock, etc.)
- Automatic model routing and provider detection
- Built-in cost tracking and usage analytics
- Fallback/retry logic across providers
- Consistent error handling
- No vendor lock-in

See [LiteLLM Integration Design](./litellm-integration-design.md) for technical details.

---

## Sign-Off

**Product Owner:** [Name]
**Technical Lead:** [Name]
**Approved By:** [Name]
**Date:** February 12, 2026

---

**End of PRD**
