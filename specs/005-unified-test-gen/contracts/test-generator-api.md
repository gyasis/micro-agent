# Contract: src/helpers/test-generator.ts

**Feature**: 005-unified-test-gen
**Date**: 2026-02-22

## Public API (Exported)

### `findExistingTests(targetFile, workingDir): Promise<string | null>`

Checks if a test file already exists for the given source file.

**Parameters**:
- `targetFile: string` — path to source file (relative or absolute)
- `workingDir: string` — working directory for resolving relative paths

**Returns**: Absolute path of found test file, or `null` if none exists.

**Search patterns** (checked in order):
1. `{dir}/{basename}.test.{ext}` — e.g., `math.test.ts`
2. `{dir}/{basename}.spec.{ext}` — e.g., `math.spec.ts`
3. `{dir}/test_{basename}.{ext}` — e.g., `test_math.py`
4. `{dir}/{basename}_spec.{ext}` — e.g., `math_spec.rb`

**Special case**: `.rs` files always return `null` (Rust inline tests — no external file convention)

---

### `generateTestFile(options: TestGeneratorOptions): Promise<TestGeneratorResult>`

Generates a test file for the given source file using an AI model.

**Preconditions** (caller must verify before calling):
- `findExistingTests()` returned `null`
- Target file extension is not `.rs`
- `resolveTestFilePath()` returns a non-null path

**Behavior**:
1. Resolves test file path via `resolveTestFilePath()`
2. Reads source file content from disk
3. Gathers up to 2 example tests from `workingDir` via glob
4. Builds generation messages via `buildGenerationMessages()`
5. Calls `ProviderRouter.complete()` with `provider: 'anthropic'`
6. Extracts code block from response via `extractCodeBlock()`
7. Writes code to `testFilePath` via `fs.promises.writeFile()`
8. Returns `TestGeneratorResult`

**Error handling**:
- If source file unreadable → throws with clear message
- If LLM call fails → throws (caller logs and treats as warning)
- If write fails → throws (caller logs and treats as warning)

---

### Interfaces

```typescript
export interface TestGeneratorOptions {
  targetFile: string;
  objective: string;
  workingDir: string;
  framework: string;
  model?: string;       // defaults to 'claude-sonnet-4-20250514'
  verbose?: boolean;
}

export interface TestGeneratorResult {
  testFilePath: string;
  testCommand: string;
  generatedByModel: string;
}
```

---

## Internal Helpers (NOT exported)

### `resolveTestFilePath(targetFile, framework): string | null`

| Input Extension | Output Pattern             | Notes                     |
|-----------------|---------------------------|---------------------------|
| `.ts`           | `{dir}/{name}.test.ts`     |                           |
| `.tsx`          | `{dir}/{name}.test.tsx`    |                           |
| `.js`           | `{dir}/{name}.test.js`     |                           |
| `.jsx`          | `{dir}/{name}.test.jsx`    |                           |
| `.py`           | `{dir}/test_{name}.py`     | Python prefix convention  |
| `.rs`           | `null`                     | Rust — skip always        |
| `.rb`           | `{dir}/{name}_spec.rb`     | Ruby RSpec convention     |
| other           | `{dir}/{name}.test.{ext}`  | Best-effort fallback      |

---

### `buildTestCommand(testFilePath, framework): string`

| Framework | Command                                      |
|-----------|----------------------------------------------|
| vitest    | `npx vitest run {basename-no-ext}`           |
| jest      | `npx jest {basename-no-ext} --no-watch`      |
| pytest    | `pytest {relativeTestFilePath}`              |
| mocha     | `npx mocha {testFilePath}`                   |
| rspec     | `bundle exec rspec {testFilePath}`           |
| cargo     | `npm test` (fallback)                        |
| custom    | `npm test` (fallback)                        |

---

### `extractCodeBlock(raw: string): string`

Extracts the content of the first ` ``` ` fenced code block.

- Finds first ` ``` ` → skips optional language specifier line
- Reads until next ` ``` ` → returns trimmed content
- If no fence found → returns `raw` trimmed as-is

---

### `gatherExampleTests(workingDir: string): Promise<string[]>`

Globs `**/*.{test,spec}.{ts,js,py,rb}` ignoring `node_modules`, `dist`, `.git`.
Returns up to 2 file contents as strings.

---

### `buildGenerationMessages(targetFile, targetContent, objective, testFilePath, exampleTests, packageJson): Message[]`

Returns `[systemMessage, userMessage]` formatted for `ProviderRouter.complete()`.

**System message**:
> "You are an AI assistant that generates comprehensive unit tests. Think step by step about inputs, outputs, behavior, and edge cases. Return ONLY a code block with the complete test file — no prose."

**User message template**:
```
Generate a unit test file for:
<objective>{objective}</objective>

Source file at `{targetFile}`:
<source>{targetContent}</source>

Test file will be at `{testFilePath}`.

[IF examples exist:]
Example tests from this project:
<examples>
{examples[0]}
---
{examples[1]}
</examples>

[ELSE IF package.json available:]
package.json:
<package-json>{packageJson}</package-json>

Only output the test code.
```

---

## CLI Contract: --no-generate flag

**Addition to `src/cli/ralph-loop.ts`**:
```
.option('--no-generate', 'Skip automatic test file generation when no test file exists')
```

Commander automatically sets `options.generate = false` when `--no-generate` is passed.
`options.generate` is `undefined` (truthy) when the flag is absent.

**Addition to `RunOptions` interface in `src/cli/commands/run.ts`**:
```typescript
generate?: boolean;
```
