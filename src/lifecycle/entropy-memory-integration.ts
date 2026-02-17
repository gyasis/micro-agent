/**
 * Entropy Detector + MemoryVault Integration (T065)
 *
 * Wires entropy detector to MemoryVault for pattern learning:
 * - Stores error patterns when entropy is detected
 * - Records solutions when errors are resolved
 * - Enables cross-session learning from repeated errors
 *
 * Integration flow:
 * 1. Entropy detector tracks errors
 * 2. On circuit breaker: Store error pattern to MemoryVault
 * 3. On success after error: Record solution to MemoryVault
 * 4. Future iterations: Query MemoryVault for similar errors
 *
 * @module lifecycle/entropy-memory-integration
 */

import type { EntropyDetector, ErrorEntry, EntropyDetectionResult } from './entropy-detector';
import type { MemoryVault } from '../memory/memory-vault';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Error pattern for MemoryVault storage
 */
export interface ErrorPattern {
  errorSignature: string;
  errorCategory: string;
  occurrences: number;
  iterations: number[];
  testFramework: string;
  language: string;
  context: {
    targetFile: string;
    objective: string;
    failedTests: string[];
  };
  timestamp: string;
  resolved: boolean;
  solution?: string;
}

/**
 * Entropy + Memory Integration Manager
 *
 * T065: Connects entropy detector to MemoryVault
 */
export class EntropyMemoryIntegration {
  private entropyDetector: EntropyDetector;
  private memoryVault: MemoryVault;
  private currentSession: {
    sessionId: string;
    targetFile: string;
    objective: string;
    language: string;
    framework: string;
  };

  constructor(
    entropyDetector: EntropyDetector,
    memoryVault: MemoryVault,
    sessionConfig: {
      sessionId: string;
      targetFile: string;
      objective: string;
      language: string;
      framework: string;
    }
  ) {
    this.entropyDetector = entropyDetector;
    this.memoryVault = memoryVault;
    this.currentSession = sessionConfig;

    // Wire entropy detector events to MemoryVault
    this.setupEventHandlers();

    logger.info('Entropy + Memory integration initialized', {
      sessionId: sessionConfig.sessionId,
    });
  }

  /**
   * Setup event handlers for entropy detection
   */
  private setupEventHandlers(): void {
    // T065: Store error pattern when entropy is detected
    this.entropyDetector.on('entropy-detected', async (result: EntropyDetectionResult) => {
      await this.storeErrorPattern(result);
    });
  }

  /**
   * Store error pattern to MemoryVault when entropy is detected (T065)
   */
  private async storeErrorPattern(result: EntropyDetectionResult): Promise<void> {
    logger.info('Storing error pattern to MemoryVault', {
      errorSignature: result.errorSignature,
      count: result.count,
    });

    // Create error pattern
    const pattern: ErrorPattern = {
      errorSignature: result.errorSignature,
      errorCategory: this.categorizeError(result.errorSignature),
      occurrences: result.count,
      iterations: result.recentErrors.map(e => e.iteration),
      testFramework: this.currentSession.framework,
      language: this.currentSession.language,
      context: {
        targetFile: this.currentSession.targetFile,
        objective: this.currentSession.objective,
        failedTests: this.extractFailedTests(result.recentErrors),
      },
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    try {
      // Store pattern in MemoryVault
      // Note: Actual MemoryVault API may differ, this is the integration contract
      await this.memoryVault.storeErrorPattern({
        category: pattern.errorCategory,
        signature: pattern.errorSignature,
        context: JSON.stringify(pattern),
        metadata: {
          occurrences: pattern.occurrences,
          language: pattern.language,
          framework: pattern.testFramework,
        },
      });

      logger.info('Error pattern stored to MemoryVault', {
        category: pattern.errorCategory,
        signature: pattern.errorSignature,
      });
    } catch (error) {
      logger.error('Failed to store error pattern to MemoryVault', error);
    }
  }

  /**
   * Record solution when error is resolved
   */
  public async recordSolution(
    errorSignature: string,
    solution: string,
    successfulIteration: number
  ): Promise<void> {
    logger.info('Recording solution to MemoryVault', {
      errorSignature,
      iteration: successfulIteration,
    });

    try {
      // Update error pattern with solution
      await this.memoryVault.recordFix({
        errorCategory: this.categorizeError(errorSignature),
        errorSignature,
        solution,
        successRate: 1.0, // First success
        metadata: {
          iteration: successfulIteration,
          language: this.currentSession.language,
          framework: this.currentSession.framework,
        },
      });

      logger.info('Solution recorded to MemoryVault', {
        errorSignature,
      });
    } catch (error) {
      logger.error('Failed to record solution to MemoryVault', error);
    }
  }

  /**
   * Query MemoryVault for similar error patterns
   */
  public async querySimilarErrors(
    errorMessage: string
  ): Promise<Array<{
    signature: string;
    category: string;
    solution?: string;
    similarity: number;
  }>> {
    try {
      // Query MemoryVault for similar errors
      const results = await this.memoryVault.searchSimilarErrors(errorMessage, {
        limit: 5,
        minSimilarity: 0.7,
        language: this.currentSession.language,
      });

      logger.info('Similar errors found in MemoryVault', {
        count: results.length,
      });

      return results;
    } catch (error) {
      logger.error('Failed to query MemoryVault for similar errors', error);
      return [];
    }
  }

  /**
   * Categorize error based on signature
   */
  private categorizeError(errorSignature: string): string {
    const lower = errorSignature.toLowerCase();

    if (lower.includes('syntax') || lower.includes('parse')) {
      return 'SYNTAX';
    }

    if (lower.includes('assertion') || lower.includes('expected')) {
      return 'LOGIC';
    }

    if (lower.includes('module not found') || lower.includes('import')) {
      return 'ENVIRONMENT';
    }

    if (lower.includes('timeout') || lower.includes('memory')) {
      return 'PERFORMANCE';
    }

    if (lower.includes('flaky') || lower.includes('intermittent')) {
      return 'FLAKY';
    }

    return 'UNKNOWN';
  }

  /**
   * Extract failed test names from error entries
   */
  private extractFailedTests(errors: ErrorEntry[]): string[] {
    const tests = new Set<string>();

    for (const error of errors) {
      // Extract test name from error message (simple heuristic)
      const match = error.original.match(/test[:\s]+([^\s]+)/i);
      if (match) {
        tests.add(match[1]);
      }
    }

    return Array.from(tests);
  }

  /**
   * Get entropy statistics with MemoryVault insights
   */
  public async getEnhancedStats(): Promise<{
    entropyStats: ReturnType<EntropyDetector['getStats']>;
    memoryVaultPatterns: number;
    resolvedPatterns: number;
    unresolvedPatterns: number;
  }> {
    const entropyStats = this.entropyDetector.getStats();

    try {
      // Get pattern counts from MemoryVault
      const patterns = await this.memoryVault.getErrorPatternStats();

      return {
        entropyStats,
        memoryVaultPatterns: patterns.total || 0,
        resolvedPatterns: patterns.resolved || 0,
        unresolvedPatterns: patterns.unresolved || 0,
      };
    } catch (error) {
      logger.error('Failed to get MemoryVault stats', error);

      return {
        entropyStats,
        memoryVaultPatterns: 0,
        resolvedPatterns: 0,
        unresolvedPatterns: 0,
      };
    }
  }
}

/**
 * Create entropy + memory integration
 */
export function createEntropyMemoryIntegration(
  entropyDetector: EntropyDetector,
  memoryVault: MemoryVault,
  sessionConfig: {
    sessionId: string;
    targetFile: string;
    objective: string;
    language: string;
    framework: string;
  }
): EntropyMemoryIntegration {
  return new EntropyMemoryIntegration(entropyDetector, memoryVault, sessionConfig);
}
