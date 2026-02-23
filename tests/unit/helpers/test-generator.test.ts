/**
 * Test Generator Unit Tests
 *
 * Tests all exported and internal functions of src/helpers/test-generator.ts.
 * Internal helpers are tested via the exported functions or by extracting
 * behavior through integration of the module.
 *
 * Internal functions tested indirectly:
 * - resolveTestFilePath → via generateTestFile + findExistingTests behavior
 * - buildTestCommand → via generateTestFile result.testCommand
 * - extractCodeBlock → directly tested (re-exported for testability)
 * - gatherExampleTests → via generateTestFile mock behavior
 * - buildGenerationMessages → via router.complete() call args
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// ── Mock fs/promises ──────────────────────────────────────────────────────────

vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// ── Mock glob ─────────────────────────────────────────────────────────────────

vi.mock('glob', () => ({
  glob: vi.fn(),
}));

// ── Mock ProviderRouter ───────────────────────────────────────────────────────

const mockComplete = vi.fn();
vi.mock('../../../src/llm/provider-router', () => ({
  ProviderRouter: vi.fn().mockImplementation(() => ({
    complete: mockComplete,
  })),
}));

// ── Import under test (after mocks) ──────────────────────────────────────────

import { findExistingTests, generateTestFile } from '../../../src/helpers/test-generator';
import { promises as fs } from 'fs';
import { glob } from 'glob';

const mockFs = fs as unknown as {
  access: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
};

const mockGlob = glob as unknown as ReturnType<typeof vi.fn>;

// ── Test: resolveTestFilePath (via generateTestFile behavior) ─────────────────

describe('resolveTestFilePath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.readFile.mockResolvedValue('export function foo() {}');
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockGlob.mockResolvedValue([]);
    mockComplete.mockResolvedValue({
      content: '```typescript\ntest code\n```',
      model: 'claude-sonnet-4-20250514',
    });
  });

  it('.ts target → .test.ts in same directory', async () => {
    const result = await generateTestFile({
      targetFile: 'src/math.ts',
      objective: 'test math',
      workingDir: '/project',
      framework: 'vitest',
    });
    expect(result.testFilePath).toBe('src/math.test.ts');
  });

  it('.js target → .test.js in same directory', async () => {
    const result = await generateTestFile({
      targetFile: 'src/utils.js',
      objective: 'test utils',
      workingDir: '/project',
      framework: 'jest',
    });
    expect(result.testFilePath).toBe('src/utils.test.js');
  });

  it('.py target → test_{name}.py in same directory', async () => {
    const result = await generateTestFile({
      targetFile: 'services/auth.py',
      objective: 'test auth',
      workingDir: '/project',
      framework: 'pytest',
    });
    expect(result.testFilePath).toBe('services/test_auth.py');
  });

  it('.rs target → throws (Rust skip)', async () => {
    await expect(
      generateTestFile({
        targetFile: 'src/lib.rs',
        objective: 'test lib',
        workingDir: '/project',
        framework: 'cargo',
      }),
    ).rejects.toThrow(/Rust/);
  });

  it('nested path → same directory preserved', async () => {
    const result = await generateTestFile({
      targetFile: 'src/util/math.ts',
      objective: 'test nested',
      workingDir: '/project',
      framework: 'vitest',
    });
    expect(result.testFilePath).toBe('src/util/math.test.ts');
  });

  it('.rb target → {name}_spec.rb in same directory', async () => {
    const result = await generateTestFile({
      targetFile: 'app/user.rb',
      objective: 'test user',
      workingDir: '/project',
      framework: 'rspec',
    });
    expect(result.testFilePath).toBe('app/user_spec.rb');
  });
});

// ── Test: extractCodeBlock ────────────────────────────────────────────────────
// Tested indirectly — generateTestFile calls extractCodeBlock on LLM response

describe('extractCodeBlock (via generateTestFile)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.readFile.mockResolvedValue('export function foo() {}');
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockGlob.mockResolvedValue([]);
  });

  it('extracts content from typescript fence', async () => {
    mockComplete.mockResolvedValue({
      content: '```typescript\nimport { foo } from "./foo";\ntest("x", () => {});\n```',
      model: 'claude-sonnet-4-20250514',
    });
    await generateTestFile({
      targetFile: 'src/foo.ts',
      objective: 'test foo',
      workingDir: '/project',
      framework: 'vitest',
    });
    const written = mockFs.writeFile.mock.calls[0][1] as string;
    expect(written).toBe('import { foo } from "./foo";\ntest("x", () => {});');
  });

  it('extracts content from python fence', async () => {
    mockComplete.mockResolvedValue({
      content: '```python\ndef test_foo(): pass\n```',
      model: 'claude-sonnet-4-20250514',
    });
    await generateTestFile({
      targetFile: 'src/foo.py',
      objective: 'test foo',
      workingDir: '/project',
      framework: 'pytest',
    });
    const written = mockFs.writeFile.mock.calls[0][1] as string;
    expect(written).toBe('def test_foo(): pass');
  });

  it('returns raw string when no fence present', async () => {
    mockComplete.mockResolvedValue({
      content: 'test("plain", () => {})',
      model: 'claude-sonnet-4-20250514',
    });
    await generateTestFile({
      targetFile: 'src/foo.ts',
      objective: 'test foo',
      workingDir: '/project',
      framework: 'vitest',
    });
    const written = mockFs.writeFile.mock.calls[0][1] as string;
    expect(written).toBe('test("plain", () => {})');
  });

  it('handles fence without language specifier', async () => {
    mockComplete.mockResolvedValue({
      content: '```\ntest code here\n```',
      model: 'claude-sonnet-4-20250514',
    });
    await generateTestFile({
      targetFile: 'src/foo.ts',
      objective: 'test foo',
      workingDir: '/project',
      framework: 'vitest',
    });
    const written = mockFs.writeFile.mock.calls[0][1] as string;
    expect(written).toBe('test code here');
  });
});

// ── Test: buildTestCommand (via generateTestFile result) ──────────────────────

describe('buildTestCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.readFile.mockResolvedValue('export function foo() {}');
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockGlob.mockResolvedValue([]);
    mockComplete.mockResolvedValue({
      content: 'test code',
      model: 'claude-sonnet-4-20250514',
    });
  });

  it('vitest → npx vitest run {basename-no-ext}', async () => {
    const result = await generateTestFile({
      targetFile: 'src/math.ts',
      objective: 'test',
      workingDir: '/project',
      framework: 'vitest',
    });
    expect(result.testCommand).toBe('npx vitest run math.test');
  });

  it('jest → npx jest {basename-no-ext} --no-watch', async () => {
    const result = await generateTestFile({
      targetFile: 'src/math.ts',
      objective: 'test',
      workingDir: '/project',
      framework: 'jest',
    });
    expect(result.testCommand).toBe('npx jest math.test --no-watch');
  });

  it('pytest → pytest {relativePath}', async () => {
    const result = await generateTestFile({
      targetFile: 'services/auth.py',
      objective: 'test',
      workingDir: '/project',
      framework: 'pytest',
    });
    expect(result.testCommand).toBe('pytest services/test_auth.py');
  });

  it('rspec → bundle exec rspec {filePath}', async () => {
    const result = await generateTestFile({
      targetFile: 'app/user.rb',
      objective: 'test',
      workingDir: '/project',
      framework: 'rspec',
    });
    expect(result.testCommand).toContain('bundle exec rspec');
  });

  it('custom → npm test fallback', async () => {
    const result = await generateTestFile({
      targetFile: 'src/foo.ts',
      objective: 'test',
      workingDir: '/project',
      framework: 'custom',
    });
    expect(result.testCommand).toBe('npm test');
  });

  it('cargo → npm test fallback', async () => {
    // cargo files are .rs which throw, so test with unknown framework
    // by mocking resolveTestFilePath via a non-.rs file with cargo framework
    const result = await generateTestFile({
      targetFile: 'src/foo.ts',
      objective: 'test',
      workingDir: '/project',
      framework: 'cargo',
    });
    expect(result.testCommand).toBe('npm test');
  });
});

// ── Test: findExistingTests ───────────────────────────────────────────────────

describe('findExistingTests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no test file exists', async () => {
    mockFs.access.mockRejectedValue(new Error('ENOENT'));
    const result = await findExistingTests('src/math.ts', '/project');
    expect(result).toBeNull();
  });

  it('returns path when .test.ts exists adjacent', async () => {
    mockFs.access.mockImplementation(async (p: unknown) => {
      if (String(p).endsWith('math.test.ts')) return;
      throw new Error('ENOENT');
    });
    const result = await findExistingTests('src/math.ts', '/project');
    expect(result).toMatch(/math\.test\.ts$/);
  });

  it('returns path when .spec.ts exists adjacent', async () => {
    mockFs.access.mockImplementation(async (p: unknown) => {
      if (String(p).endsWith('math.spec.ts')) return;
      throw new Error('ENOENT');
    });
    const result = await findExistingTests('src/math.ts', '/project');
    expect(result).toMatch(/math\.spec\.ts$/);
  });

  it('always returns null for .rs files', async () => {
    // Even if fs.access would succeed, .rs returns null unconditionally
    mockFs.access.mockResolvedValue(undefined);
    const result = await findExistingTests('src/lib.rs', '/project');
    expect(result).toBeNull();
  });

  it('returns path for test_{name}.py prefix convention', async () => {
    mockFs.access.mockImplementation(async (p: unknown) => {
      if (String(p).endsWith('test_auth.py')) return;
      throw new Error('ENOENT');
    });
    const result = await findExistingTests('services/auth.py', '/project');
    expect(result).toMatch(/test_auth\.py$/);
  });
});

// ── Test: generateTestFile ────────────────────────────────────────────────────

describe('generateTestFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.readFile.mockResolvedValue('export function multiply(a: number, b: number) { return a * b; }');
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockGlob.mockResolvedValue([]);
    mockComplete.mockResolvedValue({
      content: '```typescript\ntest("multiply", () => {})\n```',
      model: 'claude-sonnet-4-20250514',
    });
  });

  it('calls router.complete() with provider: anthropic', async () => {
    await generateTestFile({
      targetFile: 'src/math.ts',
      objective: 'test math',
      workingDir: '/project',
      framework: 'vitest',
    });
    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'anthropic' }),
    );
  });

  it('uses claude-sonnet-4-20250514 by default', async () => {
    await generateTestFile({
      targetFile: 'src/math.ts',
      objective: 'test',
      workingDir: '/project',
      framework: 'vitest',
    });
    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-20250514' }),
    );
  });

  it('uses model override when options.model is set', async () => {
    await generateTestFile({
      targetFile: 'src/math.ts',
      objective: 'test',
      workingDir: '/project',
      framework: 'vitest',
      model: 'claude-haiku-4-5-20251001',
    });
    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
    );
  });

  it('writes extracted code to resolved testFilePath', async () => {
    await generateTestFile({
      targetFile: 'src/math.ts',
      objective: 'test',
      workingDir: '/project',
      framework: 'vitest',
    });
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      'src/math.test.ts',
      'test("multiply", () => {})',
      'utf8',
    );
  });

  it('returns correct testCommand for vitest framework', async () => {
    const result = await generateTestFile({
      targetFile: 'src/math.ts',
      objective: 'test',
      workingDir: '/project',
      framework: 'vitest',
    });
    expect(result.testCommand).toContain('vitest');
  });

  it('returns correct testCommand for pytest framework', async () => {
    const result = await generateTestFile({
      targetFile: 'services/auth.py',
      objective: 'test',
      workingDir: '/project',
      framework: 'pytest',
    });
    expect(result.testCommand).toContain('pytest');
  });

  it('throws for Rust (.rs) target', async () => {
    await expect(
      generateTestFile({
        targetFile: 'src/lib.rs',
        objective: 'test',
        workingDir: '/project',
        framework: 'cargo',
      }),
    ).rejects.toThrow();
  });

  it('includes up to 2 example tests in messages when available', async () => {
    mockGlob.mockResolvedValue(['/project/src/a.test.ts', '/project/src/b.test.ts', '/project/src/c.test.ts']);
    mockFs.readFile.mockImplementation(async (p: unknown) => {
      if (String(p).endsWith('.test.ts')) return `// example test ${p}`;
      return 'export function foo() {}';
    });

    await generateTestFile({
      targetFile: 'src/math.ts',
      objective: 'test',
      workingDir: '/project',
      framework: 'vitest',
    });

    const callArgs = mockComplete.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMessage.content).toContain('<examples>');
  });

  it('falls back to package.json block when no examples exist', async () => {
    mockGlob.mockResolvedValue([]);
    mockFs.readFile.mockImplementation(async (p: unknown) => {
      if (String(p).endsWith('package.json')) return '{"name":"my-project"}';
      return 'export function foo() {}';
    });

    await generateTestFile({
      targetFile: 'src/math.ts',
      objective: 'test',
      workingDir: '/project',
      framework: 'vitest',
    });

    const callArgs = mockComplete.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMessage.content).toContain('<package-json>');
  });
});
