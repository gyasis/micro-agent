# Data Model: Unified Test Generation for ma-loop

**Feature**: 005-unified-test-gen
**Date**: 2026-02-22

## Entities

### TestGeneratorOptions (input)

Passed to `generateTestFile()` by `run.ts`. All fields known at call time.

| Field         | Type     | Required | Description                                           |
|---------------|----------|----------|-------------------------------------------------------|
| targetFile    | string   | Yes      | Absolute or relative path to the source file          |
| objective     | string   | Yes      | User's objective string (used in the generation prompt) |
| workingDir    | string   | Yes      | Working directory for glob operations                 |
| framework     | string   | Yes      | Detected test framework (vitest/jest/pytest/rspec/...) |
| model         | string   | No       | LLM model override; defaults to claude-sonnet-4-20250514 |
| verbose       | boolean  | No       | Enable verbose logging                                |

---

### TestGeneratorResult (output)

Returned by `generateTestFile()` when generation succeeds.

| Field            | Type   | Description                                           |
|------------------|--------|-------------------------------------------------------|
| testFilePath     | string | Absolute path of the written test file                |
| testCommand      | string | Scoped command to run only this test file             |
| generatedByModel | string | Model ID that generated the test (for audit/logging)  |

---

### Internal: ResolvedTestPath

Internal intermediate value computed by `resolveTestFilePath()`.

| Value         | Source Extension | Output Pattern                     |
|---------------|------------------|------------------------------------|
| math.test.ts  | .ts              | {dir}/{name}.test.ts               |
| util.test.js  | .js              | {dir}/{name}.test.js               |
| test_auth.py  | .py              | {dir}/test_{name}.py               |
| null          | .rs              | null — skip generation             |
| user_spec.rb  | .rb              | {dir}/{name}_spec.rb               |
| foo.test.{x}  | other            | {dir}/{name}.test.{ext}            |

---

### Internal: GenerationMessages

The `Message[]` array constructed by `buildGenerationMessages()` and passed to
`ProviderRouter.complete()`.

| Index | Role   | Content                                                  |
|-------|--------|----------------------------------------------------------|
| 0     | system | "You are an AI assistant that generates comprehensive unit tests..." |
| 1     | user   | Prompt with source file content, target test path, examples |

---

## State Transitions

```
Run Command Invoked
        │
        ▼
prepareRunParameters() completes
        │
        ├─► [--no-generate OR --test set OR no targetFile] ──► Skip generation ──► loop
        │
        ▼
findExistingTests(targetFile)
        │
        ├─► [test file found] ──► log "Using existing tests: {path}" ──► loop
        │
        ▼
resolveTestFilePath(targetFile, framework)
        │
        ├─► [.rs file] ──► log "Skipping Rust: use inline #[test]" ──► loop
        │
        ▼
generateTestFile(options)
        │
        ├─► gatherExampleTests() [up to 2 examples]
        ├─► read targetFile content
        ├─► buildGenerationMessages(...)
        ├─► ProviderRouter.complete(anthropic, model, messages)
        ├─► extractCodeBlock(response.content)
        ├─► fs.writeFile(testFilePath, code)
        │
        ▼
log "Generated: {testFilePath}"
params.testCommand = scoped command
        │
        ▼
initializeInfrastructure() — loop begins
```
