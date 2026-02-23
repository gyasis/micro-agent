/**
 * Memory Vault
 *
 * ChromaDB-backed vector database for storing and retrieving:
 * - Fix patterns (successful error resolutions)
 * - Test patterns (common test structures)
 * - Code patterns (frequently used implementations)
 *
 * Enables learning across iterations and sessions.
 *
 * @module memory/memory-vault
 */

import { ChromaClient, Collection } from 'chromadb';
import type { FixPattern, TestPattern } from '../agents/base/agent-context';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface MemoryVaultConfig {
  host?: string;
  port?: number;
  maxPatterns?: number;
  similarityThreshold?: number;
}

export interface SearchResult<T> {
  pattern: T;
  similarity: number;
  id: string;
}

/**
 * Memory Vault for storing and retrieving patterns
 */
export class MemoryVault {
  private client: ChromaClient;
  private config: Required<MemoryVaultConfig>;
  private fixCollection: Collection | null = null;
  private testCollection: Collection | null = null;
  private connected: boolean = true;

  constructor(config: MemoryVaultConfig = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 8000,
      maxPatterns: config.maxPatterns || 1000,
      similarityThreshold: config.similarityThreshold || 0.85,
    };

    this.client = new ChromaClient({
      path: `http://${this.config.host}:${this.config.port}`,
    });
  }

  /**
   * Initialize collections with 3-second timeout fallback.
   * If ChromaDB is unreachable, sets connected=false and logs a warning.
   * Does NOT throw — callers continue in no-op mode.
   */
  async initialize(): Promise<void> {
    try {
      const initPromise = Promise.all([
        this.client.getOrCreateCollection({
          name: 'fix_patterns',
          metadata: { description: 'Successful error fix patterns' },
        }),
        this.client.getOrCreateCollection({
          name: 'test_patterns',
          metadata: { description: 'Common test patterns and structures' },
        }),
      ]);

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('ChromaDB connection timeout after 3s')),
          3000,
        ),
      );

      const [fixCol, testCol] = await Promise.race([initPromise, timeout]);
      this.fixCollection = fixCol;
      this.testCollection = testCol;

      logger.info('Memory Vault initialized', {
        host: this.config.host,
        port: this.config.port,
      });
    } catch (error) {
      logger.warn(
        '[MemoryVault] ChromaDB unavailable — running in no-op mode',
        {
          error,
        },
      );
      this.connected = false;
    }
  }

  /**
   * Returns true if ChromaDB was successfully connected during initialize().
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Store a fix pattern
   */
  async storeFixPattern(pattern: FixPattern): Promise<void> {
    if (!this.connected) return;

    if (!this.fixCollection) {
      throw new Error('Memory Vault not initialized');
    }

    try {
      // Create embedding text
      const embeddingText = this.createFixEmbeddingText(pattern);

      await this.fixCollection.add({
        ids: [pattern.id],
        documents: [embeddingText],
        metadatas: [
          {
            errorSignature: pattern.errorSignature,
            solution: pattern.solution,
            context: JSON.stringify(pattern.context),
            successRate: pattern.successRate,
            timesApplied: pattern.timesApplied,
            lastUsed: pattern.lastUsed.toISOString(),
            category: pattern.category || 'general',
          },
        ],
      });

      logger.info('Fix pattern stored', { id: pattern.id });

      // Prune if over limit
      await this.pruneFixPatterns();
    } catch (error) {
      logger.error('Failed to store fix pattern', error);
      throw error;
    }
  }

  /**
   * Search for similar fix patterns
   */
  async searchFixPatterns(
    errorSignature: string,
    context: string[],
    limit: number = 5,
    category?: string,
  ): Promise<SearchResult<FixPattern>[]> {
    if (!this.connected) return [];

    if (!this.fixCollection) {
      throw new Error('Memory Vault not initialized');
    }

    try {
      const queryText = this.createFixQueryText(errorSignature, context);

      const queryOptions: any = {
        queryTexts: [queryText],
        nResults: limit,
      };

      if (category) {
        queryOptions.where = { category };
      }

      const results = await this.fixCollection.query(queryOptions);

      const patterns: SearchResult<FixPattern>[] = [];

      if (results.ids && results.distances && results.metadatas) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const id = results.ids[0][i];
          const distance = results.distances[0][i];
          const metadata = results.metadatas[0][i];

          if (!metadata) continue;
          if (distance === null) continue;

          const similarity = 1 - distance;

          if (similarity < this.config.similarityThreshold) {
            continue;
          }

          patterns.push({
            pattern: {
              id,
              errorSignature: metadata.errorSignature as string,
              solution: metadata.solution as string,
              context: JSON.parse(metadata.context as string),
              successRate: metadata.successRate as number,
              timesApplied: metadata.timesApplied as number,
              lastUsed: new Date(metadata.lastUsed as string),
              category: metadata.category as string | undefined,
            },
            similarity,
            id,
          });
        }
      }

      return patterns;
    } catch (error) {
      logger.error('Failed to search fix patterns', error);
      return [];
    }
  }

  /**
   * Search for similar errors by error message (convenience wrapper).
   * Returns fix patterns whose errorSignature matches the query.
   * Accepts an optional options bag for limit, minSimilarity, language.
   */
  async searchSimilarErrors(
    errorMessage: string,
    _options?: { limit?: number; minSimilarity?: number; language?: string },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    if (!this.connected) return [];
    return this.searchFixPatterns(errorMessage, [], _options?.limit ?? 5);
  }

  /**
   * Store an error pattern (convenience wrapper).
   * Accepts either positional args (signature, solution, context[]) or an object bag.
   */
  async storeErrorPattern(
    signatureOrData:
      | string
      | {
          signature?: string;
          category?: string;
          solution?: string;
          context?: string | string[];
          metadata?: Record<string, unknown>;
        },
    solution?: string,
    context?: string[],
  ): Promise<void> {
    if (!this.connected) return;

    let sig: string;
    let sol: string;
    let ctx: string[];

    if (typeof signatureOrData === 'string') {
      sig = signatureOrData;
      sol = solution ?? '';
      ctx = context ?? [];
    } else {
      sig = signatureOrData.signature ?? '';
      sol = signatureOrData.solution ?? '';
      ctx = Array.isArray(signatureOrData.context)
        ? signatureOrData.context
        : signatureOrData.context
          ? [signatureOrData.context]
          : [];
    }

    const pattern: FixPattern = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      errorSignature: sig,
      solution: sol,
      context: ctx,
      successRate: 1.0,
      timesApplied: 1,
      lastUsed: new Date(),
    };
    return this.storeFixPattern(pattern);
  }

  /**
   * Record a successful fix (convenience wrapper for storeErrorPattern).
   * Accepts either a simple object or a richer one with errorCategory/metadata.
   */
  async recordFix(data: {
    errorSignature: string;
    solution: string;
    context?: string[];
    errorCategory?: string;
    successRate?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.connected) return;
    return this.storeErrorPattern(
      data.errorSignature,
      data.solution,
      data.context ?? [],
    );
  }

  /**
   * Get error pattern statistics.
   */
  async getErrorPatternStats(): Promise<{
    total: number;
    averageSuccessRate: number;
  }> {
    if (!this.connected) return { total: 0, averageSuccessRate: 0 };

    try {
      const stats = await this.getStats();
      return { total: stats.fixPatterns, averageSuccessRate: 0 };
    } catch {
      return { total: 0, averageSuccessRate: 0 };
    }
  }

  /**
   * Update fix pattern usage
   */
  async updateFixPatternUsage(id: string, successful: boolean): Promise<void> {
    if (!this.connected) return;

    if (!this.fixCollection) {
      throw new Error('Memory Vault not initialized');
    }

    try {
      const result = await this.fixCollection.get({
        ids: [id],
      });

      if (!result.metadatas || result.metadatas.length === 0) {
        return;
      }

      const metadata = result.metadatas[0];
      if (!metadata) return;

      const timesApplied = (metadata.timesApplied as number) + 1;
      const successRate = successful
        ? ((metadata.successRate as number) * (timesApplied - 1) + 1) /
          timesApplied
        : ((metadata.successRate as number) * (timesApplied - 1)) /
          timesApplied;

      await this.fixCollection.update({
        ids: [id],
        metadatas: [
          {
            ...metadata,
            timesApplied,
            successRate,
            lastUsed: new Date().toISOString(),
          },
        ],
      });

      logger.info('Fix pattern usage updated', {
        id,
        successful,
        timesApplied,
        successRate,
      });
    } catch (error) {
      logger.error('Failed to update fix pattern usage', error);
    }
  }

  /**
   * Store a test pattern
   */
  async storeTestPattern(pattern: TestPattern): Promise<void> {
    if (!this.connected) return;

    if (!this.testCollection) {
      throw new Error('Memory Vault not initialized');
    }

    try {
      const embeddingText = this.createTestEmbeddingText(pattern);

      await this.testCollection.add({
        ids: [pattern.id],
        documents: [embeddingText],
        metadatas: [
          {
            testType: pattern.testType,
            pattern: pattern.pattern,
            framework: pattern.framework,
            examples: JSON.stringify(pattern.examples),
          },
        ],
      });

      logger.info('Test pattern stored', { id: pattern.id });

      await this.pruneTestPatterns();
    } catch (error) {
      logger.error('Failed to store test pattern', error);
      throw error;
    }
  }

  /**
   * Search for test patterns
   */
  async searchTestPatterns(
    testType: string,
    framework: string,
    limit: number = 5,
  ): Promise<SearchResult<TestPattern>[]> {
    if (!this.connected) return [];

    if (!this.testCollection) {
      throw new Error('Memory Vault not initialized');
    }

    try {
      const queryText = `${testType} test for ${framework}`;

      const results = await this.testCollection.query({
        queryTexts: [queryText],
        nResults: limit,
      });

      const patterns: SearchResult<TestPattern>[] = [];

      if (results.ids && results.distances && results.metadatas) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const id = results.ids[0][i];
          const distance = results.distances[0][i];
          const metadata = results.metadatas[0][i];

          if (!metadata) continue;
          if (distance === null) continue;

          const similarity = 1 - distance;

          if (similarity < this.config.similarityThreshold) {
            continue;
          }

          patterns.push({
            pattern: {
              id,
              testType: metadata.testType as any,
              pattern: metadata.pattern as string,
              framework: metadata.framework as string,
              examples: JSON.parse(metadata.examples as string),
            },
            similarity,
            id,
          });
        }
      }

      return patterns;
    } catch (error) {
      logger.error('Failed to search test patterns', error);
      return [];
    }
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    fixPatterns: number;
    testPatterns: number;
  }> {
    if (!this.connected) return { fixPatterns: 0, testPatterns: 0 };

    try {
      const fixCount = await this.fixCollection?.count();
      const testCount = await this.testCollection?.count();

      return {
        fixPatterns: fixCount || 0,
        testPatterns: testCount || 0,
      };
    } catch (error) {
      return {
        fixPatterns: 0,
        testPatterns: 0,
      };
    }
  }

  /**
   * Create embedding text for fix pattern
   */
  private createFixEmbeddingText(pattern: FixPattern): string {
    return `Error: ${pattern.errorSignature}
Solution: ${pattern.solution}
Context: ${pattern.context.join(', ')}`;
  }

  /**
   * Create query text for fix search
   */
  private createFixQueryText(
    errorSignature: string,
    context: string[],
  ): string {
    return `Error: ${errorSignature}
Context: ${context.join(', ')}`;
  }

  /**
   * Create embedding text for test pattern
   */
  private createTestEmbeddingText(pattern: TestPattern): string {
    return `${pattern.testType} test for ${pattern.framework}: ${pattern.pattern}`;
  }

  /**
   * Prune fix patterns to stay under limit
   */
  private async pruneFixPatterns(): Promise<void> {
    if (!this.fixCollection) return;

    try {
      const count = await this.fixCollection.count();

      if (count > this.config.maxPatterns) {
        const all = await this.fixCollection.get();

        if (!all.ids || !all.metadatas) return;

        const sorted = all.ids
          .map((id, i) => ({
            id,
            metadata: all.metadatas![i],
          }))
          .sort((a, b) => {
            const rateA = (a.metadata?.successRate as number) ?? 0;
            const rateB = (b.metadata?.successRate as number) ?? 0;
            return rateA - rateB;
          });

        const toDelete = sorted.slice(0, count - this.config.maxPatterns);
        const idsToDelete = toDelete.map((p) => p.id);

        await this.fixCollection.delete({
          ids: idsToDelete,
        });

        logger.info('Pruned fix patterns', {
          deleted: idsToDelete.length,
          remaining: this.config.maxPatterns,
        });
      }
    } catch (error) {
      logger.error('Failed to prune fix patterns', error);
    }
  }

  /**
   * Prune test patterns
   */
  private async pruneTestPatterns(): Promise<void> {
    if (!this.testCollection) return;

    try {
      const count = await this.testCollection.count();

      if (count > this.config.maxPatterns) {
        const all = await this.testCollection.get();

        if (!all.ids) return;

        const toDelete = all.ids.slice(0, count - this.config.maxPatterns);

        await this.testCollection.delete({
          ids: toDelete,
        });

        logger.info('Pruned test patterns', {
          deleted: toDelete.length,
          remaining: this.config.maxPatterns,
        });
      }
    } catch (error) {
      logger.error('Failed to prune test patterns', error);
    }
  }

  /**
   * Clear all patterns
   */
  async clear(): Promise<void> {
    if (!this.connected) return;

    try {
      if (this.fixCollection) {
        await this.client.deleteCollection({ name: 'fix_patterns' });
      }

      if (this.testCollection) {
        await this.client.deleteCollection({ name: 'test_patterns' });
      }

      await this.initialize();

      logger.info('Memory Vault cleared');
    } catch (error) {
      logger.error('Failed to clear Memory Vault', error);
      throw error;
    }
  }
}
