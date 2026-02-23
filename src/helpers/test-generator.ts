/**
 * Test Generator
 *
 * Auto-generates a unit test file for a given source file when none exists.
 * Used by the Ralph Loop run command before iterations begin.
 *
 * Design decisions:
 * - Uses ProviderRouter (reads ANTHROPIC_API_KEY from env) not getSimpleCompletion (legacy ini)
 * - Pure functions — no class, no module-level side effects
 * - Dynamic import from run.ts (matches runSimpleIteration pattern)
 *
 * @module helpers/test-generator
 */

import path from 'path';
import { promises as fs } from 'fs';
import { glob } from 'glob';
import {
  ProviderRouter,
  type Message,
} from '../llm/provider-router';

// ── Public Interfaces ─────────────────────────────────────────────────────────

export interface TestGeneratorOptions {
  /** Absolute or relative path to the source file */
  targetFile: string;
  /** User's objective string — used in the generation prompt */
  objective: string;
  /** Working directory for glob operations and relative paths */
  workingDir: string;
  /** Detected test framework (vitest/jest/pytest/rspec/mocha/cargo/custom) */
  framework: string;
  /** LLM model override; defaults to claude-sonnet-4-20250514 */
  model?: string;
  verbose?: boolean;
}

export interface TestGeneratorResult {
  /** Absolute path of the written test file */
  testFilePath: string;
  /** Scoped command to run only this test file */
  testCommand: string;
  /** Model ID that generated the test */
  generatedByModel: string;
}

// ── Public Exports ────────────────────────────────────────────────────────────

/**
 * Check if a test file already exists for the given source file.
 * Returns the absolute path of the found test file, or null if none exists.
 *
 * Search order: .test.{ext} → .spec.{ext} → test_{name}.{ext} → {name}_spec.{ext}
 * .rs files always return null (Rust uses inline #[test] blocks).
 */
export async function findExistingTests(
  targetFile: string,
  workingDir: string,
): Promise<string | null> {
  const resolved = path.resolve(workingDir, targetFile);
  const dir = path.dirname(resolved);
  const ext = path.extname(resolved);
  const basename = path.basename(resolved, ext);

  // Rust always returns null — no external test file convention
  if (ext === '.rs') return null;

  const candidates = [
    path.join(dir, `${basename}.test${ext}`),
    path.join(dir, `${basename}.spec${ext}`),
    path.join(dir, `test_${basename}${ext}`),
    path.join(dir, `${basename}_spec${ext}`),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // not found — try next
    }
  }

  return null;
}

/**
 * Generate a test file for the given source file using an AI model.
 * Writes the generated code to disk and returns the result.
 *
 * Throws if:
 * - Source file is unreadable
 * - Target language is Rust (resolveTestFilePath returns null)
 * - LLM call fails
 * - File write fails
 *
 * Caller should wrap in try/catch and treat errors as warnings.
 */
export async function generateTestFile(
  options: TestGeneratorOptions,
): Promise<TestGeneratorResult> {
  const {
    targetFile,
    objective,
    workingDir,
    framework,
    model = 'claude-sonnet-4-20250514',
  } = options;

  // Resolve test file path — null means skip (Rust)
  const testFilePath = resolveTestFilePath(targetFile, framework);
  if (!testFilePath) {
    throw new Error(
      `Cannot generate test for ${targetFile} — Rust targets use inline #[test] blocks`,
    );
  }

  // Read source file content
  const resolvedSource = path.resolve(workingDir, targetFile);
  const targetContent = await fs.readFile(resolvedSource, 'utf8');

  // Gather up to 2 example tests for style guidance
  const exampleTests = await gatherExampleTests(workingDir);

  // Read package.json as fallback context
  const packageJson = await fs
    .readFile(path.join(workingDir, 'package.json'), 'utf8')
    .catch(() => '');

  // Build LLM messages
  const messages = buildGenerationMessages(
    targetFile,
    targetContent,
    objective,
    testFilePath,
    exampleTests,
    packageJson,
  );

  // Call ProviderRouter (reads ANTHROPIC_API_KEY from env)
  const router = new ProviderRouter();
  const response = await router.complete({
    provider: 'anthropic',
    model,
    messages,
    temperature: 0.7,
    maxTokens: 4096,
  });

  // Extract code from response
  const code = extractCodeBlock(response.content);

  // Write test file to disk
  await fs.mkdir(path.dirname(testFilePath), { recursive: true });
  await fs.writeFile(testFilePath, code, 'utf8');

  return {
    testFilePath,
    testCommand: buildTestCommand(testFilePath, framework, workingDir),
    generatedByModel: response.model,
  };
}

// ── Internal Helpers (NOT exported) ──────────────────────────────────────────

/**
 * Resolve the test file path for a given source file and framework.
 * Returns null for Rust (inline tests only).
 */
function resolveTestFilePath(
  targetFile: string,
  _framework: string,
): string | null {
  const ext = path.extname(targetFile);
  const dir = path.dirname(targetFile);
  const basename = path.basename(targetFile, ext);

  switch (ext) {
    case '.ts':
    case '.tsx':
      return path.join(dir, `${basename}.test${ext}`);
    case '.js':
    case '.jsx':
      return path.join(dir, `${basename}.test${ext}`);
    case '.py':
      return path.join(dir, `test_${basename}${ext}`);
    case '.rs':
      return null; // Rust uses inline #[test] — skip
    case '.rb':
      return path.join(dir, `${basename}_spec${ext}`);
    default:
      return path.join(dir, `${basename}.test${ext}`);
  }
}

/**
 * Build the scoped test command for a generated test file.
 * Scopes the command to run only the generated file, not the full suite.
 */
function buildTestCommand(
  testFilePath: string,
  framework: string,
  workingDir: string,
): string {
  const ext = path.extname(testFilePath);
  const basenameNoExt = path.basename(testFilePath, ext);
  // If testFilePath is already relative, use it directly; only call path.relative for absolute paths
  const relativePath = path.isAbsolute(testFilePath)
    ? path.relative(workingDir, testFilePath)
    : testFilePath;

  switch (framework) {
    case 'vitest':
      return `npx vitest run ${basenameNoExt}`;
    case 'jest':
      return `npx jest ${basenameNoExt} --no-watch`;
    case 'pytest':
      return `pytest ${relativePath}`;
    case 'mocha':
      return `npx mocha ${testFilePath}`;
    case 'rspec':
      return `bundle exec rspec ${testFilePath}`;
    case 'cargo':
    case 'custom':
    default:
      return 'npm test';
  }
}

/**
 * Extract the content of the first ``` fenced code block in a string.
 * Returns the raw string (trimmed) if no fence is found.
 */
function extractCodeBlock(raw: string): string {
  const fenceStart = raw.indexOf('```');
  if (fenceStart === -1) return raw.trim();

  // Skip optional language specifier line
  const lineEnd = raw.indexOf('\n', fenceStart);
  if (lineEnd === -1) return raw.slice(fenceStart).trim();

  const codeStart = lineEnd + 1;
  const fenceEnd = raw.indexOf('```', codeStart);

  if (fenceEnd === -1) {
    // Unclosed fence — return everything after the opening line
    return raw.slice(codeStart).trim();
  }

  return raw.slice(codeStart, fenceEnd).trim();
}

/**
 * Gather up to 2 example test files from the working directory for style guidance.
 * Returns an array of file contents (strings).
 */
async function gatherExampleTests(workingDir: string): Promise<string[]> {
  const patterns = await glob('**/*.{test,spec}.{ts,js,py,rb}', {
    cwd: workingDir,
    ignore: ['node_modules/**', 'dist/**', '.git/**'],
    absolute: true,
  });

  const results: string[] = [];
  for (const filePath of patterns.slice(0, 2)) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      results.push(content);
    } catch {
      // skip unreadable files
    }
  }
  return results;
}

/**
 * Build the message array for the LLM generation call.
 * Returns [systemMessage, userMessage] formatted for ProviderRouter.complete().
 */
function buildGenerationMessages(
  targetFile: string,
  targetContent: string,
  objective: string,
  testFilePath: string,
  exampleTests: string[],
  packageJson: string,
): Message[] {
  const systemContent = [
    'You are an AI assistant that generates comprehensive unit tests.',
    'Think step by step about inputs, outputs, behavior, and edge cases.',
    'Return ONLY a code block with the complete test file — no prose, no explanation.',
  ].join(' ');

  const exampleSection =
    exampleTests.length > 0
      ? `Example tests from this project:\n<examples>\n${exampleTests.join('\n---\n')}\n</examples>`
      : packageJson
        ? `package.json:\n<package-json>\n${packageJson}\n</package-json>`
        : '';

  const userContent = [
    `Generate a unit test file for:`,
    `<objective>${objective}</objective>`,
    ``,
    `Source file at \`${targetFile}\`:`,
    `<source>${targetContent}</source>`,
    ``,
    `Test file will be at \`${testFilePath}\`.`,
    ``,
    exampleSection,
    ``,
    `Only output the test code.`,
  ]
    .join('\n')
    .trim();

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}
