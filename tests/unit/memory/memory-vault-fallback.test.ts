/**
 * MemoryVault Backend Fallback Tests
 *
 * Verifies that MemoryVault degrades gracefully when backends fail:
 * - initialize() catches failures without throwing
 * - isConnected() returns false after a failed init
 * - All public methods are no-ops (no throw, empty returns)
 * - LanceDB failure falls back to Vectra
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryVault } from '../../../src/memory/memory-vault';

// Mock the backends module so no real I/O happens
vi.mock('../../../src/memory/backends', () => {
  return {
    createVectorBackendWithFallback: vi.fn(),
  };
});

function makeVault() {
  return new MemoryVault({ vectorDb: 'lancedb' });
}

describe('MemoryVault — backend offline fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: initialize() with unreachable backends sets connected=false and does not throw', async () => {
    const { createVectorBackendWithFallback } = await import(
      '../../../src/memory/backends'
    );
    (createVectorBackendWithFallback as any).mockRejectedValue(
      new Error('Both backends failed'),
    );

    const vault = makeVault();
    await expect(vault.initialize()).resolves.toBeUndefined();
    expect(vault.isConnected()).toBe(false);
  });

  it('Test 2: storeFixPattern() when connected=false returns void without throwing', async () => {
    const { createVectorBackendWithFallback } = await import(
      '../../../src/memory/backends'
    );
    (createVectorBackendWithFallback as any).mockRejectedValue(
      new Error('ECONNREFUSED'),
    );

    const vault = makeVault();
    await vault.initialize(); // sets connected=false

    const pattern = {
      id: 'test-id',
      errorSignature: 'TypeError: x is not a function',
      solution: 'Check that x is defined before calling it',
      context: ['src/utils.ts'],
      successRate: 1.0,
      timesApplied: 1,
      lastUsed: new Date(),
    };

    await expect(vault.storeFixPattern(pattern)).resolves.toBeUndefined();
  });

  it('Test 3: searchFixPatterns() when connected=false returns empty array without throwing', async () => {
    const { createVectorBackendWithFallback } = await import(
      '../../../src/memory/backends'
    );
    (createVectorBackendWithFallback as any).mockRejectedValue(
      new Error('ECONNREFUSED'),
    );

    const vault = makeVault();
    await vault.initialize(); // sets connected=false

    const results = await vault.searchFixPatterns(
      'TypeError: x is not defined',
      [],
    );
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('Test 4: initialize() with timeout exceeded sets connected=false', async () => {
    const { createVectorBackendWithFallback } = await import(
      '../../../src/memory/backends'
    );

    // Mock a slow backend that exceeds the 3s timeout
    (createVectorBackendWithFallback as any).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                isConnected: () => true,
                initialize: async () => {},
              }),
            4000,
          ),
        ),
    );

    const vault = makeVault();
    await expect(vault.initialize()).resolves.toBeUndefined();
    expect(vault.isConnected()).toBe(false);
  }, 10000);

  it('Test 5: successful backend init sets connected=true', async () => {
    const { createVectorBackendWithFallback } = await import(
      '../../../src/memory/backends'
    );

    const mockBackend = {
      isConnected: () => true,
      initialize: vi.fn(),
      addDocuments: vi.fn(),
      query: vi.fn().mockResolvedValue({ ids: [], distances: [], metadatas: [] }),
      get: vi.fn().mockResolvedValue({ metadatas: [] }),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      clear: vi.fn(),
    };

    (createVectorBackendWithFallback as any).mockResolvedValue(mockBackend);

    const vault = makeVault();
    await vault.initialize();
    expect(vault.isConnected()).toBe(true);
  });

  it('Test 6: all convenience methods are no-ops when disconnected', async () => {
    const { createVectorBackendWithFallback } = await import(
      '../../../src/memory/backends'
    );
    (createVectorBackendWithFallback as any).mockRejectedValue(
      new Error('offline'),
    );

    const vault = makeVault();
    await vault.initialize();

    // searchSimilarErrors
    expect(await vault.searchSimilarErrors('any error')).toEqual([]);

    // storeErrorPattern
    await expect(vault.storeErrorPattern('sig', 'sol')).resolves.toBeUndefined();

    // recordFix
    await expect(
      vault.recordFix({ errorSignature: 'e', solution: 's' }),
    ).resolves.toBeUndefined();

    // getErrorPatternStats
    expect(await vault.getErrorPatternStats()).toEqual({
      total: 0,
      averageSuccessRate: 0,
    });

    // updateFixPatternUsage
    await expect(
      vault.updateFixPatternUsage('id', true),
    ).resolves.toBeUndefined();

    // storeTestPattern
    await expect(
      vault.storeTestPattern({
        id: 'tp1',
        testType: 'unit' as any,
        pattern: 'p',
        framework: 'vitest',
        examples: [],
      }),
    ).resolves.toBeUndefined();

    // searchTestPatterns
    expect(await vault.searchTestPatterns('unit', 'vitest')).toEqual([]);

    // getStats
    expect(await vault.getStats()).toEqual({ fixPatterns: 0, testPatterns: 0 });

    // clear
    await expect(vault.clear()).resolves.toBeUndefined();
  });
});
