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
   * Initialize collections
   */
  async initialize(): Promise<void> {
    try {
      // Create or get fix patterns collection
      this.fixCollection = await this.client.getOrCreateCollection({
        name: 'fix_patterns',
        metadata: { description: 'Successful error fix patterns' },
      });

      // Create or get test patterns collection
      this.testCollection = await this.client.getOrCreateCollection({
        name: 'test_patterns',
        metadata: { description: 'Common test patterns and structures' },
      });

      logger.info('Memory Vault initialized', {
        host: this.config.host,
        port: this.config.port,
      });
    } catch (error) {
      logger.error('Failed to initialize Memory Vault', error);
      throw error;
    }
  }

  /**
   * Store a fix pattern
   */
  async storeFixPattern(pattern: FixPattern): Promise<void> {
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
            category: pattern.category || 'general', // Store category for filtering
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
    category?: string // Optional category filter (T092 optimization)
  ): Promise<SearchResult<FixPattern>[]> {
    if (!this.fixCollection) {
      throw new Error('Memory Vault not initialized');
    }

    try {
      // Create query embedding
      const queryText = this.createFixQueryText(errorSignature, context);

      // Build query with optional category filter
      const queryOptions: any = {
        queryTexts: [queryText],
        nResults: limit,
      };

      // Add category filter if provided (T092 optimization)
      if (category) {
        queryOptions.where = { category };
      }

      const results = await this.fixCollection.query(queryOptions);

      // Convert to SearchResult
      const patterns: SearchResult<FixPattern>[] = [];

      if (results.ids && results.distances && results.metadatas) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const id = results.ids[0][i];
          const distance = results.distances[0][i];
          const metadata = results.metadatas[0][i];

          if (!metadata) continue;

          // Convert distance to similarity (1 - distance)
          const similarity = 1 - distance;

          // Filter by threshold
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
   * Update fix pattern usage
   */
  async updateFixPatternUsage(
    id: string,
    successful: boolean
  ): Promise<void> {
    if (!this.fixCollection) {
      throw new Error('Memory Vault not initialized');
    }

    try {
      // Get current pattern
      const result = await this.fixCollection.get({
        ids: [id],
      });

      if (!result.metadatas || result.metadatas.length === 0) {
        return;
      }

      const metadata = result.metadatas[0];
      const timesApplied = (metadata.timesApplied as number) + 1;
      const successRate = successful
        ? ((metadata.successRate as number) * (timesApplied - 1) + 1) / timesApplied
        : ((metadata.successRate as number) * (timesApplied - 1)) / timesApplied;

      // Update metadata
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

      // Prune if over limit
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
    limit: number = 5
  ): Promise<SearchResult<TestPattern>[]> {
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
  private createFixQueryText(errorSignature: string, context: string[]): string {
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
        // Get all patterns ordered by success rate and last used
        const all = await this.fixCollection.get();

        if (!all.ids || !all.metadatas) return;

        // Sort by success rate (ascending) to remove worst performers
        const sorted = all.ids
          .map((id, i) => ({
            id,
            metadata: all.metadatas![i],
          }))
          .sort((a, b) => {
            const rateA = a.metadata.successRate as number;
            const rateB = b.metadata.successRate as number;
            return rateA - rateB;
          });

        // Delete oldest/worst performers
        const toDelete = sorted.slice(0, count - this.config.maxPatterns);
        const idsToDelete = toDelete.map(p => p.id);

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

        // Simple FIFO pruning for test patterns
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
    try {
      if (this.fixCollection) {
        await this.client.deleteCollection({ name: 'fix_patterns' });
      }

      if (this.testCollection) {
        await this.client.deleteCollection({ name: 'test_patterns' });
      }

      // Reinitialize
      await this.initialize();

      logger.info('Memory Vault cleared');
    } catch (error) {
      logger.error('Failed to clear Memory Vault', error);
      throw error;
    }
  }
}
