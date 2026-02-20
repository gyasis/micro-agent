# ralph.config.yaml — Configuration Reference

This document describes every field in the `ralph.config.yaml` configuration file.
Fields are validated at startup using Zod schemas defined in
`src/config/schema-validator.ts`. Defaults are provided by `src/config/defaults.ts`.

---

## Top-Level Structure

```yaml
models:         # Agent model assignments
languages:      # Language-specific test settings
testing:        # Testing strategy toggles
successCriteria: # Pass/fail thresholds
budgets:        # Iteration, cost, and time ceilings
memory:         # MemoryVault vector-DB settings
plugins:        # Plugin list (array)
sandbox:        # Execution sandbox settings
tierConfigFile: # Path to N-tier escalation config
```

All top-level keys are optional. When a key is absent the default values from
`getDefaults()` are used.

---

## `models` section

Controls which LLM is used for each agent role.

### `models.<agent>` sub-fields

Each agent (`librarian`, `artisan`, `critic`, `chaos`, `localGuard`) shares the
same sub-schema (`ModelConfigSchema`).

| Key | Type | Default | Valid Values | Description |
|-----|------|---------|--------------|-------------|
| `provider` | `string` (enum) | — | `anthropic`, `google`, `openai`, `ollama`, `azure` | LLM provider. Required when the agent block is specified. |
| `model` | `string` | — | Any valid model ID for the provider | Model identifier passed to the provider API. Required when the agent block is specified. |
| `apiKey` | `string` | — | Any string | Override API key for this agent. Falls back to environment variables when omitted. |
| `temperature` | `number` | — | `0`–`2` | Sampling temperature. Lower values produce more deterministic output. |
| `maxTokens` | `number` | — | Any positive integer | Maximum tokens the model may generate per call. |
| `baseUrl` | `string` (URL) | — | Any valid URL | Custom endpoint, e.g. for self-hosted Ollama or Azure deployments. |

### Agent defaults (from `src/config/defaults.ts`)

| Agent | Provider | Model | Temperature |
|-------|----------|-------|-------------|
| `librarian` | `google` | `gemini-2.5-flash` | `0.3` |
| `artisan` | `anthropic` | `claude-sonnet-4-20250514` | `0.7` |
| `critic` | `openai` | `gpt-4o-mini` | `0.2` |
| `chaos` | `anthropic` | `claude-sonnet-4-20250514` | `0.9` |
| `localGuard` | _(not set)_ | _(not set)_ | _(not set)_ |

The `localGuard` agent is reserved for future local-model safety checks and has
no built-in default.

---

## `languages` section

Provides per-language overrides for test discovery and coverage tooling.

### `languages.<lang>` sub-fields

Each language key (`typescript`, `javascript`, `python`, `rust`) accepts the
same sub-schema (`LanguageConfigSchema`). All fields are optional.

| Key | Type | Default | Valid Values | Description |
|-----|------|---------|--------------|-------------|
| `testFramework` | `string` | — | e.g. `jest`, `vitest`, `pytest` | Testing framework name. Used by `TestRunner.detectFramework()` for output parsing. |
| `testPattern` | `string` | See below | Any glob pattern | File glob used to locate test files. |
| `testCommand` | `string` | — | Any shell command | Custom command to run tests. When set, `TestRunner` still calls `detectFramework()` to select the correct output parser. |
| `coverageTool` | `string` | See below | e.g. `c8`, `coverage`, `cargo-tarpaulin` | Coverage tool name passed to the test runner. |

### Language defaults

| Language | `testPattern` | `coverageTool` |
|----------|--------------|----------------|
| `typescript` | `**/*.test.ts` | `c8` |
| `javascript` | `**/*.test.js` | `c8` |
| `python` | `test_*.py` | `coverage` |
| `rust` | `*_test.rs` | `cargo-tarpaulin` |

---

## `testing` section

Boolean switches that control which testing strategies the Chaos and Critic
agents apply (`TestingConfigSchema`).

| Key | Type | Default | Valid Values | Description |
|-----|------|---------|--------------|-------------|
| `adversarialTests` | `boolean` | `true` | `true`, `false` | Generate adversarial inputs designed to break the implementation. |
| `propertyBasedTests` | `boolean` | `true` | `true`, `false` | Generate property-based (fuzzing-style) test cases. |
| `mutationTesting` | `boolean` | `true` | `true`, `false` | Apply mutation testing to measure test suite effectiveness. |
| `boundaryValueTesting` | `boolean` | `true` | `true`, `false` | Generate tests at numeric and logical boundary conditions. |
| `raceConditionTesting` | `boolean` | `false` | `true`, `false` | Test for concurrent race conditions. Disabled by default because it is expensive. |

---

## `successCriteria` section

Thresholds that determine when the Ralph Loop declares success
(`SuccessCriteriaSchema`).

| Key | Type | Default | Valid Values | Description |
|-----|------|---------|--------------|-------------|
| `testsPass` | `boolean` | `true` | `true`, `false` | All tests in the test suite must pass. |
| `adversarialTestsPass` | `boolean` | `true` | `true`, `false` | Adversarial tests generated by the Chaos agent must also pass. |
| `coverageThreshold` | `number` | `90` | `0`–`100` | Minimum line coverage percentage required. Omit to skip coverage gating. |
| `mutationScoreMin` | `number` | `80` | `0`–`100` | Minimum mutation score percentage required. Omit to skip mutation gating. |
| `linterErrors` | `boolean` | — | `true`, `false` | When `true`, zero linter errors are required. Omit to skip lint gating. |

---

## `budgets` section

Hard ceilings that stop the loop before resources are exhausted
(`BudgetConfigSchema`).

| Key | Type | Default | Valid Values | Description |
|-----|------|---------|--------------|-------------|
| `maxIterations` | `number` | `30` | Any positive integer | Maximum number of Ralph Loop iterations before giving up. |
| `maxCostUsd` | `number` | `2.0` | Any positive number | Maximum total LLM API cost in US dollars. |
| `maxDurationMinutes` | `number` | `15` | Any positive number | Maximum wall-clock run time in minutes. |

The `IterationManager` checks all three limits before starting each iteration.
The first limit reached stops the loop and reports the reason.

---

## `memory` section

Configuration for the MemoryVault vector database used to store and retrieve
successful fix patterns across sessions (`MemoryConfigSchema`).

| Key | Type | Default | Valid Values | Description |
|-----|------|---------|--------------|-------------|
| `vectorDb` | `string` (enum) | `chromadb` | `chromadb`, `lancedb` | Vector database backend. |
| `embeddingModel` | `string` | `all-MiniLM-L6-v2` | Any sentence-transformer model ID | Embedding model used to convert code snippets to vectors. |
| `similarityThreshold` | `number` | `0.85` | `0`–`1` | Cosine similarity cutoff for pattern retrieval. Higher values retrieve only very close matches. |
| `maxPatterns` | `number` | `1000` | Any positive integer | Maximum number of patterns stored in the vector DB. Older patterns are evicted when the limit is reached. |
| `globalSharing` | `boolean` | `false` | `true`, `false` | When `true`, patterns are shared across all projects on the machine. When `false`, patterns are scoped to the current project. |
| `contextResetFrequency` | `number` | `1` | Any positive integer | Reset LLM context every N iterations. The gold standard is `1` (fresh context every iteration). Values above `1` degrade quality and trigger a startup warning. |

---

## `plugins` section

An optional array of plugin definitions (`PluginsConfigSchema`). Each element
follows `PluginConfigSchema`.

| Key | Type | Default | Valid Values | Description |
|-----|------|---------|--------------|-------------|
| `name` | `string` | — | Any string | Plugin identifier. Required. |
| `enabled` | `boolean` | `true` | `true`, `false` | Whether the plugin is active for this run. |
| `config` | `object` | — | Any key-value record | Arbitrary plugin-specific configuration passed through without schema validation. |

When no `plugins` key is present the default is an empty array (`[]`).

---

## `sandbox` section

Configuration for the code execution sandbox (`SandboxConfigSchema`).

| Key | Type | Default | Valid Values | Description |
|-----|------|---------|--------------|-------------|
| `type` | `string` (enum) | `docker` | `docker`, `webcontainers` | Sandbox technology. `docker` runs tests inside an isolated container; `webcontainers` runs them in a browser-based VM. |
| `memoryLimit` | `string` | `2048m` | Docker memory string | Memory ceiling for the sandbox container (e.g. `512m`, `4g`). |
| `timeoutSeconds` | `number` | `300` | Any positive integer | Seconds before an individual test run is killed. |
| `networkMode` | `string` (enum) | `none` | `none`, `bridge`, `host` | Docker network mode. `none` is the most secure default and prevents outbound network calls from tests. |

---

## `tierConfigFile`

| Key | Type | Default | Valid Values | Description |
|-----|------|---------|--------------|-------------|
| `tierConfigFile` | `string` | — | Path to a JSON file | Path to the N-tier escalation configuration file (relative to `cwd` or absolute). When set, the run command loads the tier config and enables multi-tier escalation. See `docs/api/lifecycle.md` for the `TierEscalationConfig` schema. |

---

## Complete Example

The following `ralph.config.yaml` demonstrates every section with representative
values.

```yaml
# ralph.config.yaml — example configuration

models:
  librarian:
    provider: google
    model: gemini-2.5-flash
    temperature: 0.3
  artisan:
    provider: anthropic
    model: claude-sonnet-4-20250514
    temperature: 0.7
    maxTokens: 8192
  critic:
    provider: openai
    model: gpt-4o-mini
    temperature: 0.2
  chaos:
    provider: anthropic
    model: claude-sonnet-4-20250514
    temperature: 0.9
  localGuard:
    provider: ollama
    model: mistral
    baseUrl: http://localhost:11434

languages:
  typescript:
    testPattern: "**/*.test.ts"
    testCommand: "npx vitest run"
    coverageTool: c8
  javascript:
    testPattern: "**/*.test.js"
    coverageTool: c8
  python:
    testPattern: "test_*.py"
    testCommand: "pytest"
    coverageTool: coverage
  rust:
    testPattern: "*_test.rs"
    testCommand: "cargo test"
    coverageTool: cargo-tarpaulin

testing:
  adversarialTests: true
  propertyBasedTests: true
  mutationTesting: true
  boundaryValueTesting: true
  raceConditionTesting: false

successCriteria:
  testsPass: true
  adversarialTestsPass: true
  coverageThreshold: 90
  mutationScoreMin: 80
  linterErrors: true

budgets:
  maxIterations: 30
  maxCostUsd: 2.0
  maxDurationMinutes: 15

memory:
  vectorDb: chromadb
  embeddingModel: all-MiniLM-L6-v2
  similarityThreshold: 0.85
  maxPatterns: 1000
  globalSharing: false
  contextResetFrequency: 1

plugins:
  - name: slack-notifier
    enabled: true
    config:
      webhookUrl: "https://hooks.slack.com/services/XXX/YYY/ZZZ"
      channel: "#ci-alerts"
  - name: custom-lint-check
    enabled: false

sandbox:
  type: docker
  memoryLimit: 2048m
  timeoutSeconds: 300
  networkMode: none

tierConfigFile: ./.micro-agent/tiers.json
```

---

## Validation

At startup Ralph validates the merged config (file + CLI flags + defaults) using
`validateConfig()` from `src/config/schema-validator.ts`. When validation fails
the process exits with a structured error listing every offending field:

```
successCriteria.coverageThreshold: Number must be less than or equal to 100
budgets.maxCostUsd: Expected number, received string
```

Use `validateConfigWithErrors()` to validate programmatically without throwing:

```typescript
import { validateConfigWithErrors } from './src/config/schema-validator';

const { valid, config, errors } = validateConfigWithErrors(rawYaml);
if (!valid) {
  errors?.forEach(e => console.error(e));
}
```
