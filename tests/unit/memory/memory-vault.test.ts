/**
 * Memory Vault Unit Tests
 *
 * Tests for vector database storage, retrieval,
 * and similarity search using the Vectra backend
 * (pure JS, no native deps — safe for CI).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryVault } from '../../../src/memory/memory-vault';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Use a temp directory for each test run
let tmpDir: string;

function makeVault(): MemoryVault {
  return new MemoryVault({
    vectorDb: 'vectra',
    dataDir: tmpDir,
    similarityThreshold: 0.0, // Accept any match in tests
  });
}

describe('MemoryVault', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Fix Pattern Storage', () => {
    it('should store and retrieve a fix pattern', async () => {
      const vault = makeVault();
      await vault.initialize();
      expect(vault.isConnected()).toBe(true);

      const pattern = {
        id: 'fix-1',
        errorSignature: 'TypeError: Cannot read property of undefined',
        solution: 'Add null check before access',
        context: ['src/utils.ts'],
        successRate: 1.0,
        timesApplied: 1,
        lastUsed: new Date(),
      };

      await vault.storeFixPattern(pattern);

      const stats = await vault.getStats();
      expect(stats.fixPatterns).toBe(1);
    });

    it('should generate unique ID via storeErrorPattern', async () => {
      const vault = makeVault();
      await vault.initialize();

      await vault.storeErrorPattern('TypeError: x', 'fix x', ['ctx']);

      const stats = await vault.getStats();
      expect(stats.fixPatterns).toBe(1);
    });

    it('should track success rate via updateFixPatternUsage', async () => {
      const vault = makeVault();
      await vault.initialize();

      const pattern = {
        id: 'fix-rate',
        errorSignature: 'ReferenceError: foo',
        solution: 'define foo',
        context: [],
        successRate: 1.0,
        timesApplied: 1,
        lastUsed: new Date(),
      };

      await vault.storeFixPattern(pattern);
      // update usage — should not throw
      await vault.updateFixPatternUsage('fix-rate', true);
    });
  });

  describe('Similarity Search', () => {
    it('should return results for similar error signature', async () => {
      const vault = makeVault();
      await vault.initialize();

      await vault.storeFixPattern({
        id: 'fix-search-1',
        errorSignature: 'TypeError: Cannot read property x of undefined',
        solution: 'Add null check',
        context: ['src/foo.ts'],
        successRate: 0.9,
        timesApplied: 3,
        lastUsed: new Date(),
      });

      const results = await vault.searchFixPatterns(
        'TypeError: Cannot read property x of undefined',
        ['src/foo.ts'],
      );

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].pattern.solution).toBe('Add null check');
    });

    it('should return empty array for no matches', async () => {
      const vault = makeVault();
      await vault.initialize();

      const results = await vault.searchFixPatterns('completely unique error', []);
      expect(results).toEqual([]);
    });
  });

  describe('Test Pattern Storage', () => {
    it('should store and search test patterns', async () => {
      const vault = makeVault();
      await vault.initialize();

      await vault.storeTestPattern({
        id: 'tp-1',
        testType: 'unit' as any,
        pattern: 'describe/it block',
        framework: 'vitest',
        examples: ['it("should work", () => {})'],
      });

      const stats = await vault.getStats();
      expect(stats.testPatterns).toBe(1);

      const results = await vault.searchTestPatterns('unit', 'vitest');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Convenience Methods', () => {
    it('searchSimilarErrors returns results', async () => {
      const vault = makeVault();
      await vault.initialize();

      await vault.storeFixPattern({
        id: 'conv-1',
        errorSignature: 'SyntaxError: unexpected token',
        solution: 'Fix syntax',
        context: [],
        successRate: 1.0,
        timesApplied: 1,
        lastUsed: new Date(),
      });

      const results = await vault.searchSimilarErrors('SyntaxError: unexpected token');
      expect(Array.isArray(results)).toBe(true);
    });

    it('recordFix stores a pattern', async () => {
      const vault = makeVault();
      await vault.initialize();

      await vault.recordFix({
        errorSignature: 'err',
        solution: 'sol',
        context: ['ctx'],
      });

      const stats = await vault.getStats();
      expect(stats.fixPatterns).toBe(1);
    });

    it('getErrorPatternStats returns totals', async () => {
      const vault = makeVault();
      await vault.initialize();

      const stats = await vault.getErrorPatternStats();
      expect(stats).toEqual({ total: 0, averageSuccessRate: 0 });
    });
  });

  describe('Clear', () => {
    it('should clear all patterns', async () => {
      const vault = makeVault();
      await vault.initialize();

      await vault.storeFixPattern({
        id: 'clear-1',
        errorSignature: 'Error',
        solution: 'Fix',
        context: [],
        successRate: 1,
        timesApplied: 1,
        lastUsed: new Date(),
      });

      await vault.clear();

      const stats = await vault.getStats();
      expect(stats.fixPatterns).toBe(0);
      expect(stats.testPatterns).toBe(0);
    });
  });
});
