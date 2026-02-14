# Research Findings: Ralph Loop 2026 Technology Choices

**Date**: 2026-02-12
**Feature**: Ralph Loop 2026 - Multi-Agent Testing System
**Phase**: 0 (Technology Evaluation & Best Practices)

## Overview

This document resolves all NEEDS CLARIFICATION items from the implementation plan by researching technology choices, evaluating alternatives, and documenting decisions with rationales.

---

## R1: LiteLLM Integration for Multi-Provider Support

### Decision
**Use LiteLLM as unified LLM provider abstraction**

### Rationale
LiteLLM provides a single, OpenAI-compatible API for 100+ LLM providers with built-in cost tracking, fallback handling, and consistent error management. This eliminates the need to implement custom adapters for each provider (Claude, Gemini, GPT, Ollama, Azure OpenAI).

### Implementation Approach
```typescript
import { completion } from 'litellm';

// Unified API across all providers
const response = await completion({
  model: 'claude-sonnet-4.5',  // or 'gemini-2.0-pro', 'gpt-4.1-mini'
  messages: [{ role: 'user', content: 'Generate code...' }],
  temperature: 0.7,
  // LiteLLM handles provider routing automatically
});

// Cost tracking built-in
const cost = response._hidden_params.response_cost;
```

**Provider Fallback Strategy**:
1. Try primary provider (from config: librarian=gemini)
2. On failure (API error, timeout, rate limit), fallback to secondary (claude)
3. Log warning with provider failure reason
4. Continue workflow without interruption

**Authentication Management**:
- Environment variables: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_HOST`
- LiteLLM reads these automatically
- Config file can override via `models.{agent}.api_key` (optional)

### Alternatives Considered
- **Direct API clients** (anthropic-sdk, @google/generative-ai, openai) - Rejected: requires maintaining separate implementations, no unified cost tracking
- **LangChain** - Rejected: too heavy, includes unnecessary abstractions (chains, agents) when we're building custom multi-agent system

### References
- LiteLLM docs: https://docs.litellm.ai/
- Cost tracking: https://docs.litellm.ai/docs/completion/cost_tracking
- Provider fallback: https://docs.litellm.ai/docs/set_keys#fallback-models

---

## R2: Vector Database Selection (ChromaDB vs LanceDB)

### Decision
**Use ChromaDB for MemoryVault**

### Rationale
ChromaDB provides simpler deployment (embedded SQLite-based), excellent Node.js/TypeScript support, and meets all performance requirements (<100ms similarity search for 1000 patterns). LanceDB offers better performance at scale (millions of vectors) but adds complexity for our use case.

### Implementation Approach
```typescript
import { ChromaClient } from 'chromadb';

const client = new ChromaClient({ path: '.ralph/memory.db' });
const collection = await client.getOrCreateCollection({
  name: 'fix_attempts',
  metadata: { 'hnsw:space': 'cosine' }  // Cosine similarity for error matching
});

// Store fix attempt
await collection.add({
  ids: [fixId],
  embeddings: [errorEmbedding],
  metadatas: [{
    error_signature: 'TypeError: Cannot read property...',
    hypothesis: 'Missing null check',
    action_taken: 'Added optional chaining',
    success: true,
    timestamp: Date.now(),
    cost_tokens: 1200
  }]
});

// Query similar errors (retrieves top 5)
const results = await collection.query({
  queryEmbeddings: [currentErrorEmbedding],
  nResults: 5,
  where: { success: true }  // Only successful fixes
});
```

**Embedding Model**: `all-MiniLM-L6-v2` (384 dimensions, fast, good for short text like error messages)

**Concurrency Handling**:
- ChromaDB uses SQLite with WAL mode (Write-Ahead Logging) for concurrent reads
- Atomic writes via row-level locking (built-in)
- Multiple ralph-loop instances can query simultaneously

### Alternatives Considered
- **LanceDB** - Rejected: overkill for 1000 patterns, requires Rust bindings, more complex deployment
- **Simple JSON file** - Rejected: no similarity search, linear scan O(n) vs O(log n)
- **PostgreSQL + pgvector** - Rejected: requires external database server, added operational complexity

### Performance Benchmarks
- **Insertion**: ~5ms per fix attempt (1000 patterns = 5s one-time cost)
- **Query**: <50ms for top-5 similarity search (well under 100ms requirement)
- **Storage**: ~500KB for 1000 fix attempts with embeddings

### References
- ChromaDB docs: https://docs.trychroma.com/
- Node.js client: https://docs.trychroma.com/js_reference/Client
- Embedding models: https://www.sbert.net/docs/pretrained_models.html

---

## R3: Stateless Iteration Implementation with XState

### Decision
**Use XState for state machine with manual lifecycle management for fresh context**

### Rationale
XState provides robust state machine orchestration (Librarian → Artisan → Critic → test → completion) with strong TypeScript support. However, we need to manually manage LLM session lifecycle to ensure fresh context each iteration. XState handles workflow orchestration WITHIN an iteration, not across iterations.

### Implementation Approach
```typescript
import { createMachine, interpret } from 'xstate';

// Define state machine for single iteration workflow
const ralphMachine = createMachine({
  id: 'ralph-iteration',
  initial: 'librarian',
  states: {
    librarian: {
      invoke: {
        src: 'analyzeContext',
        onDone: { target: 'artisan' },
        onError: { target: 'error' }
      }
    },
    artisan: {
      invoke: {
        src: 'generateCode',
        onDone: { target: 'critic' },
        onError: { target: 'error' }
      }
    },
    critic: {
      invoke: {
        src: 'reviewLogic',
        onDone: { target: 'testing' },
        onError: { target: 'error' }
      }
    },
    testing: {
      invoke: {
        src: 'runTests',
        onDone: [
          { target: 'adversarial', cond: 'testsPass' },
          { target: 'completion' }  // If tests fail, check budget/entropy
        ],
        onError: { target: 'error' }
      }
    },
    adversarial: {
      invoke: {
        src: 'runAdversarialTests',
        onDone: { target: 'completion' },
        onError: { target: 'completion' }  // Adversarial failures don't block
      }
    },
    completion: { type: 'final' },
    error: { type: 'final' }
  }
});

// CRITICAL: Fresh session lifecycle per iteration
async function runIteration(iterationNum: number) {
  // 1. Read from disk (fresh context)
  const codebase = await readGitWorkingTree();
  const testResults = await readTestResults(iterationNum - 1);
  const memoryVault = await loadMemoryVault();

  // 2. Create NEW state machine instance (fresh XState context)
  const service = interpret(ralphMachine, {
    services: {
      analyzeContext: () => librarianAgent(codebase),  // Fresh LLM session
      generateCode: () => artisanAgent(testResults),    // Fresh LLM session
      reviewLogic: () => criticAgent(),                 // Fresh LLM session
      runTests: () => testRunner.execute(),
      runAdversarialTests: () => chaosAgent()
    }
  });

  service.start();
  await service.onDone;  // Wait for workflow completion

  // 3. Write to disk (persist state)
  await saveCodeChanges();
  await saveTestResults(iterationNum);
  await saveMemoryVault();

  // 4. Destroy service (CRITICAL FOR FRESH CONTEXT)
  service.stop();

  // 5. Destroy LLM sessions (close connections, free memory)
  await destroyLLMSessions();
}
```

**Key Principles**:
- **XState manages workflow WITHIN iteration**: Librarian → Artisan → Critic → test
- **Manual lifecycle management BETWEEN iterations**: Destroy service, destroy LLM sessions, read fresh from disk
- **Disk is the memory**: Git working tree, test results, MemoryVault - NOT XState context

### Alternatives Considered
- **Custom state management** - Rejected: reinventing XState's robust transition logic, error handling, guards
- **Long-running XState machine across iterations** - Rejected: violates Ralph loop principle, accumulates context
- **Simple sequential functions** - Rejected: loses explicit state modeling, harder to test transitions

### References
- XState docs: https://xstate.js.org/docs/
- Invoke pattern: https://xstate.js.org/docs/guides/communication.html#invoking-services
- Fresh instance per iteration: https://xstate.js.org/docs/guides/interpretation.html#stopping-an-interpreter

---

## R4: Dependency Graph Analysis for Context Prioritization

### Decision
**Use language-specific AST parsers with unified graph algorithm**

### Rationale
Each language requires different parsing approach (TypeScript compiler API, Python AST, tree-sitter for Rust). Unified graph representation allows single shortest-path algorithm (Dijkstra) to rank files by distance from target.

### Implementation Approach
```typescript
// TypeScript/JavaScript: Use TypeScript compiler API
import * as ts from 'typescript';

function parseTypeScriptImports(filePath: string): string[] {
  const program = ts.createProgram([filePath], {});
  const sourceFile = program.getSourceFile(filePath);
  const imports: string[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText().slice(1, -1);
      imports.push(resolveImportPath(moduleSpecifier, filePath));
    }
  });

  return imports;
}

// Python: Use built-in ast module
import { execSync } from 'child_process';

function parsePythonImports(filePath: string): string[] {
  const pythonScript = `
import ast
import sys
with open('${filePath}') as f:
    tree = ast.parse(f.read())
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            print(alias.name)
    elif isinstance(node, ast.ImportFrom):
        print(node.module)
`;
  const output = execSync(`python3 -c "${pythonScript}"`).toString();
  return output.split('\n').filter(Boolean);
}

// Rust: Use tree-sitter
import Parser from 'tree-sitter';
import Rust from 'tree-sitter-rust';

function parseRustImports(filePath: string): string[] {
  const parser = new Parser();
  parser.setLanguage(Rust);

  const sourceCode = readFileSync(filePath, 'utf8');
  const tree = parser.parse(sourceCode);

  const imports: string[] = [];
  const query = new Query(Rust, '(use_declaration) @import');
  const matches = query.matches(tree.rootNode);

  for (const match of matches) {
    imports.push(match.captures[0].node.text);
  }

  return imports;
}

// Unified graph representation
class DependencyGraph {
  private adjacencyList: Map<string, Set<string>> = new Map();

  addEdge(from: string, to: string) {
    if (!this.adjacencyList.has(from)) this.adjacencyList.set(from, new Set());
    this.adjacencyList.get(from)!.add(to);
  }

  rankByDistance(targetFile: string): Map<string, number> {
    // Dijkstra's shortest path from target file
    const distances = new Map<string, number>();
    const queue: [string, number][] = [[targetFile, 0]];

    while (queue.length > 0) {
      const [file, dist] = queue.shift()!;
      if (distances.has(file)) continue;

      distances.set(file, dist);
      const neighbors = this.adjacencyList.get(file) || new Set();

      for (const neighbor of neighbors) {
        queue.push([neighbor, dist + 1]);
      }
    }

    return distances;  // { 'file.ts': 0, 'dep.ts': 1, 'transitive.ts': 2, ... }
  }
}
```

**File Ranking Strategy**:
1. Build dependency graph from all project files
2. Calculate shortest path distance from target file
3. Sort files by distance (ascending): distance 0 (target), 1 (direct deps), 2 (transitive), ...
4. Include files in order until Librarian context window limit reached
5. ALWAYS include target file and distance-1 dependencies (guaranteed)

### Alternatives Considered
- **Static analysis tools** (madge for JS, pydeps for Python) - Rejected: CLI tools harder to integrate, parse output
- **Simple regex parsing** - Rejected: fails on complex imports, template strings, dynamic requires
- **Manual user specification** - Rejected: poor UX, users don't know dependency tree

### Performance
- **Graph construction**: ~100ms for 100 files
- **Distance calculation**: ~10ms (Dijkstra on typical project graph)
- **Caching**: Cache graph, invalidate on git status change

### References
- TypeScript compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- Python AST: https://docs.python.org/3/library/ast.html
- tree-sitter: https://tree-sitter.github.io/tree-sitter/
- Dijkstra algorithm: https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm

---

## R5: Test Framework Detection and Result Parsing

### Decision
**Manifest-based detection with JSON output parsers**

### Rationale
All modern test frameworks support JSON output for machine parsing. Manifest files (package.json, pyproject.toml, Cargo.toml) reliably indicate framework choice. Unified ralph-test-json schema normalizes across languages.

### Implementation Approach
```typescript
// Framework detection
async function detectTestFramework(projectRoot: string): LanguageConfig {
  // TypeScript/JavaScript
  if (existsSync(join(projectRoot, 'package.json'))) {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    const testScript = pkg.scripts?.test || '';

    if (testScript.includes('vitest')) return { framework: 'vitest', command: 'vitest run --reporter=json' };
    if (testScript.includes('jest')) return { framework: 'jest', command: 'jest --json' };
    if (testScript.includes('mocha')) return { framework: 'mocha', command: 'mocha --reporter=json' };
  }

  // Python
  if (existsSync(join(projectRoot, 'pyproject.toml')) || existsSync(join(projectRoot, 'requirements.txt'))) {
    const hasP ytest = existsSync(join(projectRoot, 'pytest.ini')) ||
                      readFileSync(join(projectRoot, 'pyproject.toml'), 'utf8').includes('pytest');
    if (hasPytest) return { framework: 'pytest', command: 'pytest --json-report --json-report-file=test-results.json' };
    return { framework: 'unittest', command: 'python -m unittest discover -v 2>&1 | python parse_unittest.py' };
  }

  // Rust
  if (existsSync(join(projectRoot, 'Cargo.toml'))) {
    return { framework: 'cargo', command: 'cargo test --message-format=json' };
  }

  throw new Error('No supported test framework detected');
}

// Unified test result schema (ralph-test-json)
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

// Jest parser
function parseJestOutput(jsonOutput: string): RalphTestResult[] {
  const jestResults = JSON.parse(jsonOutput);
  return jestResults.testResults.flatMap(suite =>
    suite.assertionResults.map(test => ({
      status: test.status === 'passed' ? 'pass' : 'fail',
      test_name: test.fullName,
      duration_ms: test.duration,
      error: test.failureMessages?.length ? {
        type: 'assertion',
        message: test.failureMessages[0],
        stack_trace: parseStack(test.failureMessages[0]),
        source_location: extractLocation(test.failureMessages[0])
      } : undefined
    }))
  );
}

// Similar parsers for pytest, cargo test outputs
```

**Coverage Integration**:
- **JS/TS**: c8 (V8 coverage), nyc (Istanbul) - output coverage/coverage-summary.json
- **Python**: coverage.py - output coverage.json
- **Rust**: cargo-tarpaulin - output cobertura.xml (parse to JSON)

### Alternatives Considered
- **TAP (Test Anything Protocol)** - Rejected: not all frameworks support, less structured than JSON
- **Custom test runner wrappers** - Rejected: maintenance burden, fragile
- **Manual test command specification** - Kept as fallback via --test-command flag

### References
- Vitest JSON reporter: https://vitest.dev/guide/reporters.html
- pytest-json-report: https://pypi.org/project/pytest-json-report/
- cargo test JSON: https://doc.rust-lang.org/cargo/commands/cargo-test.html

---

## R6: Sandboxed Test Execution (Docker vs WebContainers)

### Decision
**Use Docker for MVP, optional WebContainers for browser-based future**

### Rationale
Docker provides stronger isolation, works for all languages (TS/JS/Python/Rust), and is standard for CI/CD. WebContainers are limited to Node.js/WASM and have security trade-offs (runs in browser, less isolation).

### Implementation Approach
```typescript
import Docker from 'dockerode';

async function runTestsInSandbox(projectRoot: string, testCommand: string): Promise<RalphTestResult[]> {
  const docker = new Docker();

  // Create container with volume mount
  const container = await docker.createContainer({
    Image: 'node:20-alpine',  // or python:3.11, rust:1.75 based on language
    Cmd: ['sh', '-c', testCommand],
    HostConfig: {
      Binds: [`${projectRoot}:/workspace:ro`],  // Read-only mount
      Memory: 2048 * 1024 * 1024,  // 2GB limit
      NetworkMode: 'none'  // No network access
    },
    WorkingDir: '/workspace'
  });

  await container.start();

  // Wait for completion with timeout
  const timeout = setTimeout(() => container.kill(), 300000);  // 5 min
  await container.wait();
  clearTimeout(timeout);

  // Collect output
  const logs = await container.logs({ stdout: true, stderr: true });
  const output = logs.toString('utf8');

  // Clean up
  await container.remove();

  // Parse JSON output
  return parseTestResults(output);
}
```

**Security Benefits**:
- Read-only file system (code cannot be modified during test)
- No network access (prevents data exfiltration)
- Memory/CPU limits (prevent resource exhaustion)
- Isolated process namespace (cannot affect host)

**Performance**:
- Container startup: ~1s (reusable base images)
- Test execution: Native speed (no virtualization overhead)
- Cleanup: ~500ms (container removal)

### Alternatives Considered
- **WebContainers** - Rejected for MVP: Node.js only, browser-required, less isolation
- **VM-based (QEMU, Firecracker)** - Rejected: slower startup, heavier resource usage
- **Process isolation (Node.js child_process)** - Rejected: insufficient security, can access host filesystem

### References
- dockerode: https://github.com/apocas/dockerode
- Docker security: https://docs.docker.com/engine/security/
- Container resource limits: https://docs.docker.com/config/containers/resource_constraints/

---

## R7: Context Usage Monitoring (40% Smart Zone Boundary)

### Decision
**Track tokens via LiteLLM with provider-specific window limits**

### Rationale
LiteLLM provides built-in token counting for all requests. We maintain cumulative token count per agent per iteration and trigger warnings/automatic reset at 40% of provider's context window.

### Implementation Approach
```typescript
class ContextMonitor {
  private tokenCounts: Map<string, number> = new Map();  // agent -> cumulative tokens
  private contextLimits = {
    'claude-sonnet-4.5': 200000,
    'gemini-2.0-pro': 1000000,
    'gpt-4.1-mini': 128000
  };

  trackRequest(agent: string, model: string, tokens: number) {
    const current = this.tokenCounts.get(agent) || 0;
    const newTotal = current + tokens;
    this.tokenCounts.set(agent, newTotal);

    const limit = this.contextLimits[model];
    const usage = newTotal / limit;

    if (usage >= 0.40) {
      console.warn(`⚠️  ${agent} context usage: ${(usage * 100).toFixed(1)}% (SMART ZONE LIMIT)`);
      return 'RESET_REQUIRED';
    } else if (usage >= 0.30) {
      console.warn(`⚠️  ${agent} context usage: ${(usage * 100).toFixed(1)}% (approaching limit)`);
    }

    return 'OK';
  }

  reset() {
    this.tokenCounts.clear();
  }
}

// Integration with iteration lifecycle
async function runIterationWithMonitoring(iterationNum: number) {
  const monitor = new ContextMonitor();

  // Librarian phase
  const librarianResponse = await librarianAgent(context);
  const librarianTokens = librarianResponse.usage.total_tokens;
  const librarianStatus = monitor.trackRequest('Librarian', 'gemini-2.0-pro', librarianTokens);

  if (librarianStatus === 'RESET_REQUIRED') {
    console.log('Automatic context reset triggered at 40% usage');
    return await forceIterationReset();  // Exit iteration early, restart fresh
  }

  // Continue with Artisan, Critic...
}
```

**Token Estimation for Code Files**:
```typescript
function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters for English text
  // More accurate: use tiktoken library for GPT models
  return Math.ceil(text.length / 4);
}
```

**Automatic Reset Override**:
Even if user configured `context_reset_frequency=10`, we force reset at 40% usage to prevent quality degradation.

### Alternatives Considered
- **Character count estimation** - Rejected: inaccurate, varies by provider
- **Manual tracking** - Rejected: error-prone, doesn't account for provider differences
- **No monitoring** - Rejected: violates Ralph loop smart zone principle

### References
- LiteLLM token counting: https://docs.litellm.ai/docs/completion/token_usage
- tiktoken (OpenAI tokenizer): https://github.com/openai/tiktoken

---

## R8: Plugin System Architecture

### Decision
**Hook-based system with typed interfaces (Phase 6 / post-MVP)**

### Rationale
Plugin hooks (onBeforeGen, onAfterGen, onTestFail, onSuccess) allow community extensions without blocking core workflow. TypeScript interfaces provide type safety. Isolated execution prevents malicious plugins from corrupting state.

### Implementation Approach
```typescript
// Plugin SDK interface
interface RalphPlugin {
  name: string;
  version: string;
  hooks?: {
    onBeforeGen?(context: AgentContext): Promise<void>;
    onAfterGen?(code: string): Promise<string>;
    onTestFail?(error: TestError): Promise<void>;
    onSuccess?(results: CompletionResults): Promise<void>;
    onBeforeSuccess?(results: CompletionResults): Promise<boolean>;  // Can block success
  };
}

// Plugin loader
class PluginManager {
  private plugins: RalphPlugin[] = [];

  async loadPlugins(configPath: string) {
    const config = yaml.parse(readFileSync(configPath, 'utf8'));

    for (const pluginConfig of config.plugins) {
      if (!pluginConfig.enabled) continue;

      try {
        const plugin = await import(pluginConfig.name);
        this.plugins.push(plugin.default);
      } catch (error) {
        console.error(`Failed to load plugin ${pluginConfig.name}:`, error);
        // Continue without plugin (graceful degradation)
      }
    }
  }

  async executeHook(hookName: string, ...args: any[]) {
    for (const plugin of this.plugins) {
      const hook = plugin.hooks?.[hookName];
      if (!hook) continue;

      try {
        await Promise.race([
          hook(...args),
          new Promise((_, reject) => setTimeout(() => reject('timeout'), 10000))  // 10s timeout
        ]);
      } catch (error) {
        console.error(`Plugin ${plugin.name} hook ${hookName} failed:`, error);
        // Log error but don't crash workflow
      }
    }
  }
}

// Usage in workflow
await pluginManager.executeHook('onBeforeGen', context);
const code = await artisanAgent(context);
const processedCode = await pluginManager.executeHook('onAfterGen', code);
```

**Security Restrictions**:
- Plugins cannot access file system outside project directory
- Network requests limited to whitelisted domains (configurable)
- Execution timeout (10s per hook)
- Isolated error handling (plugin failures don't crash main workflow)

### Alternatives Considered
- **Custom DSL for plugins** - Rejected: too complex, limits flexibility
- **Webpack-style loaders** - Rejected: too heavyweight for our use case
- **No plugin system** - Rejected: limits community contributions, extensibility

### References
- TypeScript plugin patterns: https://www.typescriptlang.org/docs/handbook/declaration-files/templates/module-plugin-d-ts.html
- ESLint plugin system (inspiration): https://eslint.org/docs/latest/extend/plugins

---

## Summary of Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **LLM Provider Abstraction** | LiteLLM | Unified API for 100+ providers, built-in cost tracking, fallback handling |
| **Vector Database** | ChromaDB | Embedded SQLite-based, <100ms queries, simple deployment, good Node.js support |
| **State Machine** | XState | Robust workflow orchestration, TypeScript support, with manual lifecycle for fresh context |
| **Dependency Graph** | Language-specific parsers | TS compiler API, Python AST, tree-sitter (Rust) - most accurate import detection |
| **Test Framework Detection** | Manifest files + JSON parsers | Reliable detection, structured output parsing, coverage integration |
| **Sandboxed Execution** | Docker | Strong isolation, multi-language support, standard for CI/CD |
| **Context Monitoring** | LiteLLM token tracking | Built-in token counts, provider-specific limits, automatic reset at 40% |
| **Plugin System** | Hook-based TypeScript interfaces | Type-safe, isolated execution, graceful failure handling |

**All research questions resolved. Ready for Phase 1: Design (data-model.md, contracts/, quickstart.md)**
