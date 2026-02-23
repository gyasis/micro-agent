/**
 * Memory Vault
 *
 * Vector-database-backed storage for fix patterns and test patterns.
 * Uses a pluggable VectorBackend (LanceDB primary, Vectra fallback).
 *
 * If the backend cannot be initialized the vault enters no-op mode:
 * all reads return empty results and all writes silently succeed.
 *
 * @module memory/memory-vault
 */

import type { FixPattern, TestPattern } from '../agents/base/agent-context';
import type { VectorBackend } from './vector-backend';
import { createVectorBackendWithFallback } from './backends';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface MemoryVaultConfig {
  /** Which backend to prefer: 'lancedb' (default) or 'vectra'. */
  vectorDb?: 'lancedb' | 'vectra';
  /** Base directory for vector data (default: `process.cwd()/.micro-agent`). */
  dataDir?: string;
  maxPatterns?: number;
  similarityThreshold?: number;
  /** @deprecated ignored — LanceDB/Vectra are embedded, no host needed. */
  host?: string;
  /** @deprecated ignored — LanceDB/Vectra are embedded, no port needed. */
  port?: number;
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
  private backend: VectorBackend | null = null;
  private config: Required<
    Pick<MemoryVaultConfig, 'maxPatterns' | 'similarityThreshold'>
  > &
    Pick<MemoryVaultConfig, 'vectorDb' | 'dataDir'>;
  private connected: boolean = false;

  constructor(config: MemoryVaultConfig = {}) {
    this.config = {
      vectorDb: config.vectorDb || 'lancedb',
      dataDir:
        config.dataDir || `${process.cwd()}/.micro-agent`,
      maxPatterns: config.maxPatterns ?? 1000,
      similarityThreshold: config.similarityThreshold ?? 0.85,
    };
  }

  /**
   * Initialize the vector backend with 3-second timeout + fallback.
   * If both backends fail, sets connected=false (no-op mode).
   * Does NOT throw.
   */
  async initialize(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const initPromise = createVectorBackendWithFallback({
        vectorDb: (this.config.vectorDb as 'lancedb' | 'vectra') || 'lancedb',
        dataDir: this.config.dataDir || `${process.cwd()}/.micro-agent`,
      });

      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Vector backend connection timeout after 3s')),
          3000,
        );
      });

      this.backend = await Promise.race([initPromise, timeout]);
      clearTimeout(timer);
      this.connected = true;

      logger.info('Memory Vault initialized', {
        backend: this.config.vectorDb,
      });
    } catch (error) {
      clearTimeout(timer);
      logger.warn(
        '[MemoryVault] Vector backend unavailable — running in no-op mode',
        { error },
      );
      this.connected = false;
    }
  }

  /**
   * Returns true if the backend was successfully connected during initialize().
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Store a fix pattern
   */
  async storeFixPattern(pattern: FixPattern): Promise<void> {
    if (!this.connected || !this.backend) return;

    try {
      const embeddingText = this.createFixEmbeddingText(pattern);

      await this.backend.addDocuments(
        'fix_patterns',
        [pattern.id],
        [embeddingText],
        [
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
      );

      logger.info('Fix pattern stored', { id: pattern.id });

      await this.pruneFixPatterns();
    } catch (error) {
      logger.error('Failed to store fix pattern', error);
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
    if (!this.connected || !this.backend) return [];

    try {
      const queryText = this.createFixQueryText(errorSignature, context);

      const where = category ? { category } : undefined;
      const results = await this.backend.query(
        'fix_patterns',
        queryText,
        limit,
        where,
      );

      const patterns: SearchResult<FixPattern>[] = [];

      for (let i = 0; i < results.ids.length; i++) {
        const id = results.ids[i];
        const distance = results.distances[i];
        const metadata = results.metadatas[i];

        if (!metadata) continue;

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

      return patterns;
    } catch (error) {
      logger.error('Failed to search fix patterns', error);
      return [];
    }
  }

  /**
   * Search for similar errors by error message (convenience wrapper).
   */
  async searchSimilarErrors(
    errorMessage: string,
    _options?: { limit?: number; minSimilarity?: number; language?: string },
  ): Promise<any[]> {
    if (!this.connected) return [];
    return this.searchFixPatterns(errorMessage, [], _options?.limit ?? 5);
  }

  /**
   * Store an error pattern (convenience wrapper).
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
    if (!this.connected || !this.backend) return;

    try {
      const result = await this.backend.get('fix_patterns', [id]);

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

      await this.backend.update('fix_patterns', id, {
        ...metadata,
        timesApplied,
        successRate,
        lastUsed: new Date().toISOString(),
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
    if (!this.connected || !this.backend) return;

    try {
      const embeddingText = this.createTestEmbeddingText(pattern);

      await this.backend.addDocuments(
        'test_patterns',
        [pattern.id],
        [embeddingText],
        [
          {
            testType: pattern.testType,
            pattern: pattern.pattern,
            framework: pattern.framework,
            examples: JSON.stringify(pattern.examples),
          },
        ],
      );

      logger.info('Test pattern stored', { id: pattern.id });

      await this.pruneTestPatterns();
    } catch (error) {
      logger.error('Failed to store test pattern', error);
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
    if (!this.connected || !this.backend) return [];

    try {
      const queryText = `${testType} test for ${framework}`;

      const results = await this.backend.query(
        'test_patterns',
        queryText,
        limit,
      );

      const patterns: SearchResult<TestPattern>[] = [];

      for (let i = 0; i < results.ids.length; i++) {
        const id = results.ids[i];
        const distance = results.distances[i];
        const metadata = results.metadatas[i];

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
    if (!this.connected || !this.backend)
      return { fixPatterns: 0, testPatterns: 0 };

    try {
      const fixCount = await this.backend.count('fix_patterns');
      const testCount = await this.backend.count('test_patterns');

      return {
        fixPatterns: fixCount,
        testPatterns: testCount,
      };
    } catch {
      return {
        fixPatterns: 0,
        testPatterns: 0,
      };
    }
  }

  private createFixEmbeddingText(pattern: FixPattern): string {
    return `Error: ${pattern.errorSignature}
Solution: ${pattern.solution}
Context: ${pattern.context.join(', ')}`;
  }

  private createFixQueryText(
    errorSignature: string,
    context: string[],
  ): string {
    return `Error: ${errorSignature}
Context: ${context.join(', ')}`;
  }

  private createTestEmbeddingText(pattern: TestPattern): string {
    return `${pattern.testType} test for ${pattern.framework}: ${pattern.pattern}`;
  }

  private async pruneFixPatterns(): Promise<void> {
    if (!this.backend) return;

    try {
      const count = await this.backend.count('fix_patterns');

      if (count > this.config.maxPatterns) {
        // Use a generic query to retrieve all docs for metadata-based sorting.
        // The query text is non-empty to avoid zero-vector issues.
        const all = await this.backend.query(
          'fix_patterns',
          'fix pattern',
          count,
        );

        // Sort by success rate ascending — delete the worst performers
        const sorted = all.ids
          .map((id, i) => ({
            id,
            metadata: all.metadatas[i],
          }))
          .sort((a, b) => {
            const rateA = (a.metadata?.successRate as number) ?? 0;
            const rateB = (b.metadata?.successRate as number) ?? 0;
            return rateA - rateB;
          });

        const toDelete = sorted.slice(0, count - this.config.maxPatterns);
        const idsToDelete = toDelete.map((p) => p.id);

        await this.backend.delete('fix_patterns', idsToDelete);

        logger.info('Pruned fix patterns', {
          deleted: idsToDelete.length,
          remaining: this.config.maxPatterns,
        });
      }
    } catch (error) {
      logger.error('Failed to prune fix patterns', error);
    }
  }

  private async pruneTestPatterns(): Promise<void> {
    if (!this.backend) return;

    try {
      const count = await this.backend.count('test_patterns');

      if (count > this.config.maxPatterns) {
        // Use a generic query to retrieve all docs. Non-empty text
        // avoids zero-vector issues with the hash embedding.
        const all = await this.backend.query(
          'test_patterns',
          'test pattern',
          count,
        );

        const toDelete = all.ids.slice(0, count - this.config.maxPatterns);

        await this.backend.delete('test_patterns', toDelete);

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
    if (!this.connected || !this.backend) return;

    try {
      await this.backend.clear();

      logger.info('Memory Vault cleared');
    } catch (error) {
      logger.error('Failed to clear Memory Vault', error);
      throw error;
    }
  }
}
