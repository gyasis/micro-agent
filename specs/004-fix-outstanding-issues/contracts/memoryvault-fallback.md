# Contract: MemoryVault ChromaDB Offline Fallback

## File
`src/memory/memory-vault.ts`

## Class additions

```typescript
// New private field (add to class body, initialised to true)
private connected: boolean = true;

// New public getter (add after existing getters/methods)
public isConnected(): boolean {
  return this.connected;
}
```

## initialize() — modified behaviour

```typescript
async initialize(): Promise<void> {
  try {
    const initPromise = Promise.all([
      this.client.getOrCreateCollection({ name: 'fix_patterns', ... }),
      this.client.getOrCreateCollection({ name: 'test_patterns', ... }),
    ]);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ChromaDB connection timeout after 3s')), 3000)
    );
    const [fixCol, testCol] = await Promise.race([initPromise, timeout]);
    this.fixCollection = fixCol;
    this.testCollection = testCol;
    logger.info('Memory Vault initialized', { ... });
  } catch (error) {
    // CHANGED: log warn, set flag, do NOT re-throw
    logger.warn('[MemoryVault] ChromaDB unavailable — running in no-op mode', { error });
    this.connected = false;
  }
}
```

## Public method guards (add at top of each public method)

```typescript
// storeFixPattern, storeTestPattern:
if (!this.connected) return;

// searchFixPatterns, searchTestPatterns:
if (!this.connected) return [];

// getStats:
if (!this.connected) return { fixPatterns: 0, testPatterns: 0 };
```

## Log message (exact string for log scraping / tests)

```
[MemoryVault] ChromaDB unavailable — running in no-op mode
```

## Acceptance gate

```bash
# With ChromaDB NOT running:
npx ralph-loop run ./src/math.ts --test "npm test" 2>&1 | grep "no-op mode"
# → should print exactly one line containing "[MemoryVault] ChromaDB unavailable"

npm test   # 269/269 pass
```
