/**
 * Fix Recorder
 *
 * Records successful error fixes to MemoryVault for future retrieval.
 * Tracks what worked, in what context, and with what success rate.
 *
 * @module memory/fix-recorder
 */

import type { FixPattern } from '../agents/base/agent-context';
import { MemoryVault } from './memory-vault';
import { ErrorCategorizer, type CategorizedError } from './error-categorizer';
import { createLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger();

export interface FixAttempt {
  error: CategorizedError;
  solution: string;
  codeChanges: string[];
  testsPassed: boolean;
  timestamp: Date;
  duration: number;
}

export interface FixRecordingConfig {
  minSuccessRateToStore?: number;
  trackFailedAttempts?: boolean;
}

/**
 * Fix recorder for learning from successful error resolutions
 */
export class FixRecorder {
  private vault: MemoryVault;
  private categorizer: ErrorCategorizer;
  private config: Required<FixRecordingConfig>;
  private pendingAttempts: Map<string, FixAttempt[]> = new Map();

  constructor(vault: MemoryVault, config: FixRecordingConfig = {}) {
    this.vault = vault;
    this.categorizer = new ErrorCategorizer();
    this.config = {
      minSuccessRateToStore: config.minSuccessRateToStore || 0.5,
      trackFailedAttempts: config.trackFailedAttempts ?? true,
    };
  }

  /**
   * Record a fix attempt
   */
  async recordAttempt(attempt: FixAttempt): Promise<void> {
    const signature = attempt.error.signature;

    // Track attempt
    if (!this.pendingAttempts.has(signature)) {
      this.pendingAttempts.set(signature, []);
    }

    this.pendingAttempts.get(signature)!.push(attempt);

    // If successful, store immediately
    if (attempt.testsPassed) {
      await this.storeSuccessfulFix(attempt);
    } else if (this.config.trackFailedAttempts) {
      logger.debug('Failed fix attempt recorded', {
        signature,
        solution: attempt.solution.substring(0, 50),
      });
    }
  }

  /**
   * Store successful fix to vault
   */
  private async storeSuccessfulFix(attempt: FixAttempt): Promise<void> {
    try {
      // Check if similar pattern exists
      const existing = await this.vault.searchFixPatterns(
        attempt.error.signature,
        attempt.error.context,
        1
      );

      if (existing.length > 0 && existing[0].similarity > 0.95) {
        // Update existing pattern
        await this.vault.updateFixPatternUsage(existing[0].id, true);

        logger.info('Updated existing fix pattern', {
          id: existing[0].id,
          similarity: existing[0].similarity,
        });
      } else {
        // Create new pattern
        const pattern: FixPattern = {
          id: uuidv4(),
          errorSignature: attempt.error.signature,
          solution: attempt.solution,
          context: [
            ...attempt.error.context,
            ...attempt.codeChanges.slice(0, 3), // Include up to 3 code changes
          ],
          successRate: 1.0, // Initial success
          timesApplied: 1,
          lastUsed: attempt.timestamp,
        };

        await this.vault.storeFixPattern(pattern);

        logger.info('Stored new fix pattern', {
          id: pattern.id,
          signature: attempt.error.signature,
        });
      }
    } catch (error) {
      logger.error('Failed to store fix', error);
    }
  }

  /**
   * Get fix suggestions for an error
   */
  async getSuggestions(
    errorMessage: string,
    stackTrace?: string,
    context?: string[]
  ): Promise<FixPattern[]> {
    // Categorize error
    const categorized = this.categorizer.categorize(
      errorMessage,
      stackTrace,
      context
    );

    // Search for similar fixes
    const results = await this.vault.searchFixPatterns(
      categorized.signature,
      categorized.context,
      5
    );

    // Filter by confidence and success rate
    return results
      .filter(r => r.pattern.successRate >= this.config.minSuccessRateToStore)
      .map(r => r.pattern)
      .sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Get attempt history for error signature
   */
  getAttemptHistory(signature: string): FixAttempt[] {
    return this.pendingAttempts.get(signature) || [];
  }

  /**
   * Calculate success rate for error signature
   */
  calculateSuccessRate(signature: string): number {
    const attempts = this.getAttemptHistory(signature);

    if (attempts.length === 0) return 0;

    const successful = attempts.filter(a => a.testsPassed).length;
    return successful / attempts.length;
  }

  /**
   * Get most effective solution for error
   */
  getMostEffectiveSolution(signature: string): FixAttempt | null {
    const attempts = this.getAttemptHistory(signature);
    const successful = attempts.filter(a => a.testsPassed);

    if (successful.length === 0) return null;

    // Return fastest successful solution
    return successful.reduce((best, current) =>
      current.duration < best.duration ? current : best
    );
  }

  /**
   * Clear pending attempts
   */
  clearPendingAttempts(): void {
    this.pendingAttempts.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalAttempts: number;
    successfulAttempts: number;
    uniqueErrors: number;
    averageSuccessRate: number;
  } {
    let totalAttempts = 0;
    let successfulAttempts = 0;

    for (const attempts of this.pendingAttempts.values()) {
      totalAttempts += attempts.length;
      successfulAttempts += attempts.filter(a => a.testsPassed).length;
    }

    const uniqueErrors = this.pendingAttempts.size;
    const averageSuccessRate =
      totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;

    return {
      totalAttempts,
      successfulAttempts,
      uniqueErrors,
      averageSuccessRate,
    };
  }

  /**
   * Export fix patterns for analysis
   */
  async exportPatterns(): Promise<FixPattern[]> {
    const patterns: FixPattern[] = [];

    for (const [signature, attempts] of this.pendingAttempts.entries()) {
      const successful = attempts.filter(a => a.testsPassed);

      if (successful.length === 0) continue;

      const successRate = successful.length / attempts.length;

      if (successRate >= this.config.minSuccessRateToStore) {
        const mostEffective = this.getMostEffectiveSolution(signature)!;

        patterns.push({
          id: uuidv4(),
          errorSignature: signature,
          solution: mostEffective.solution,
          context: mostEffective.error.context,
          successRate,
          timesApplied: successful.length,
          lastUsed: mostEffective.timestamp,
        });
      }
    }

    return patterns;
  }

  /**
   * Import fix patterns
   */
  async importPatterns(patterns: FixPattern[]): Promise<void> {
    for (const pattern of patterns) {
      try {
        await this.vault.storeFixPattern(pattern);
      } catch (error) {
        logger.error('Failed to import pattern', {
          id: pattern.id,
          error,
        });
      }
    }

    logger.info('Imported fix patterns', { count: patterns.length });
  }

  /**
   * Analyze fix effectiveness by category
   */
  analyzeByCategory(): Record<
    string,
    {
      attempts: number;
      successes: number;
      successRate: number;
    }
  > {
    const categoryStats: Record<
      string,
      { attempts: number; successes: number }
    > = {};

    for (const attempts of this.pendingAttempts.values()) {
      for (const attempt of attempts) {
        const category = attempt.error.category;

        if (!categoryStats[category]) {
          categoryStats[category] = { attempts: 0, successes: 0 };
        }

        categoryStats[category].attempts++;
        if (attempt.testsPassed) {
          categoryStats[category].successes++;
        }
      }
    }

    // Calculate success rates
    const result: Record<
      string,
      { attempts: number; successes: number; successRate: number }
    > = {};

    for (const [category, stats] of Object.entries(categoryStats)) {
      result[category] = {
        ...stats,
        successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0,
      };
    }

    return result;
  }
}
