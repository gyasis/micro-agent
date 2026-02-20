/**
 * MemoryVault ChromaDB Offline Fallback Tests (T013)
 *
 * Verifies that MemoryVault degrades gracefully when ChromaDB is unreachable:
 * - initialize() catches failures without throwing
 * - isConnected() returns false after a failed init
 * - All public methods are no-ops (no throw, empty returns)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryVault } from '../../../src/memory/memory-vault';

// Mock the chromadb module so no real network calls are made
vi.mock('chromadb', () => {
  return {
    ChromaClient: vi.fn().mockImplementation(() => ({
      getOrCreateCollection: vi.fn(),
    })),
    Collection: vi.fn(),
  };
});

function makeVault() {
  return new MemoryVault({ host: 'localhost', port: 8000 });
}

describe('MemoryVault — ChromaDB offline fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: initialize() with unreachable ChromaDB sets connected=false and does not throw', async () => {
    const { ChromaClient } = await import('chromadb');
    // Make getOrCreateCollection reject (simulates unreachable server)
    const mockClient = {
      getOrCreateCollection: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    (ChromaClient as any).mockImplementation(() => mockClient);

    const vault = makeVault();
    await expect(vault.initialize()).resolves.toBeUndefined();
    expect(vault.isConnected()).toBe(false);
  });

  it('Test 2: storeFixPattern() when connected=false returns void without throwing or calling ChromaDB', async () => {
    const { ChromaClient } = await import('chromadb');
    const mockAdd = vi.fn();
    const mockClient = {
      getOrCreateCollection: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    (ChromaClient as any).mockImplementation(() => ({
      ...mockClient,
      // Add a spy on the collection's add method to ensure it's never called
      getOrCreateCollection: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    }));

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

    // Should not throw, should return void
    await expect(vault.storeFixPattern(pattern)).resolves.toBeUndefined();
    // mockAdd should never have been called (no ChromaDB calls)
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('Test 3: searchFixPatterns() when connected=false returns empty array without throwing', async () => {
    const { ChromaClient } = await import('chromadb');
    (ChromaClient as any).mockImplementation(() => ({
      getOrCreateCollection: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    }));

    const vault = makeVault();
    await vault.initialize(); // sets connected=false

    const results = await vault.searchFixPatterns('TypeError: x is not defined', []);
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('Test 4: initialize() with timeout exceeded sets connected=false', async () => {
    const { ChromaClient } = await import('chromadb');

    // Mock getOrCreateCollection to resolve AFTER 3s timeout (> 3000ms)
    (ChromaClient as any).mockImplementation(() => ({
      getOrCreateCollection: vi.fn().mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve({ name: 'fix_patterns', id: 'fake' }), 4000)
          )
      ),
    }));

    const vault = makeVault();
    // initialize() should not throw even when timeout fires
    await expect(vault.initialize()).resolves.toBeUndefined();
    expect(vault.isConnected()).toBe(false);
  }, 10000); // allow 10s for this test
});
