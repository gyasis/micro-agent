/**
 * Entropy Detector Circuit Breaker (T057)
 *
 * Detects when the same error repeats multiple times, indicating:
 * - Agent is stuck in a loop
 * - Tests have systemic issues
 * - Environment problem preventing progress
 *
 * Circuit breaker triggers at threshold (default: 3 identical errors)
 * and pauses execution for manual intervention.
 *
 * T066: Adversarial test failures do NOT increment entropy counter
 * (they are informational, not blocking errors)
 *
 * @module lifecycle/entropy-detector
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Entropy detection configuration
 */
export interface EntropyConfig {
  threshold: number; // Number of identical errors before circuit breaker (default: 3)
  windowSize: number; // Number of recent errors to track (default: 10)
  resetOnDifferentError: boolean; // Reset counter on different error (default: true)
}

/**
 * Error entry for tracking
 */
export interface ErrorEntry {
  signature: string; // Normalized error signature
  original: string; // Original error message
  iteration: number;
  timestamp: number;
  source: 'unit_test' | 'integration_test' | 'adversarial_test' | 'system';
  category?: string; // SYNTAX, LOGIC, ENVIRONMENT, etc.
}

/**
 * Entropy detection result
 */
export interface EntropyDetectionResult {
  entropyDetected: boolean;
  errorSignature: string;
  count: number;
  threshold: number;
  recentErrors: ErrorEntry[];
  message: string;
}

/**
 * Entropy Detector with Circuit Breaker
 *
 * T057: Tracks identical errors and triggers circuit breaker
 * T066: Filters out adversarial test failures
 */
export class EntropyDetector extends EventEmitter {
  private config: EntropyConfig;
  private errorHistory: ErrorEntry[] = [];
  private entropyCounter: Map<string, number> = new Map();
  private lastErrorSignature: string | null = null;

  constructor(config: Partial<EntropyConfig> = {}) {
    super();
    this.config = {
      threshold: config.threshold || 3,
      windowSize: config.windowSize || 10,
      resetOnDifferentError: config.resetOnDifferentError !== false,
    };

    logger.debug('Entropy detector initialized', this.config);
  }

  /**
   * Track error and check for entropy (T057)
   *
   * T066: Adversarial test failures are filtered out
   */
  public trackError(
    errorMessage: string,
    iteration: number,
    source: ErrorEntry['source'] = 'unit_test',
    category?: string
  ): EntropyDetectionResult {
    // T066: Adversarial test failures do NOT increment entropy counter
    if (source === 'adversarial_test') {
      logger.debug('Adversarial test failure ignored for entropy tracking', {
        iteration,
      });

      return {
        entropyDetected: false,
        errorSignature: '',
        count: 0,
        threshold: this.config.threshold,
        recentErrors: [],
        message: 'Adversarial test failures do not count toward entropy',
      };
    }

    // Normalize error signature
    const signature = this.normalizeErrorSignature(errorMessage);

    // Create error entry
    const entry: ErrorEntry = {
      signature,
      original: errorMessage,
      iteration,
      timestamp: Date.now(),
      source,
      category,
    };

    // Add to history
    this.errorHistory.push(entry);

    // Maintain window size
    if (this.errorHistory.length > this.config.windowSize) {
      this.errorHistory.shift();
    }

    // Check if same error is repeating
    if (signature === this.lastErrorSignature) {
      // Increment counter for this signature
      const count = (this.entropyCounter.get(signature) || 0) + 1;
      this.entropyCounter.set(signature, count);

      logger.warn('Repeated error detected', {
        signature,
        count,
        threshold: this.config.threshold,
      });

      // Check if circuit breaker should trigger
      if (count >= this.config.threshold) {
        const result: EntropyDetectionResult = {
          entropyDetected: true,
          errorSignature: signature,
          count,
          threshold: this.config.threshold,
          recentErrors: this.getRecentErrorsForSignature(signature),
          message: `Circuit breaker triggered: ${count} identical errors detected`,
        };

        // Emit entropy event
        this.emit('entropy-detected', result);

        logger.error('🛑 ENTROPY DETECTED - Circuit breaker triggered', {
          errorSignature: signature,
          count,
          threshold: this.config.threshold,
          iterations: result.recentErrors.map(e => e.iteration),
        });

        return result;
      }
    } else {
      // Different error detected
      if (this.config.resetOnDifferentError) {
        logger.debug('Different error - resetting entropy counter', {
          previous: this.lastErrorSignature,
          new: signature,
        });

        this.entropyCounter.clear();
      }

      this.lastErrorSignature = signature;
      this.entropyCounter.set(signature, 1);
    }

    return {
      entropyDetected: false,
      errorSignature: signature,
      count: this.entropyCounter.get(signature) || 1,
      threshold: this.config.threshold,
      recentErrors: this.getRecentErrorsForSignature(signature),
      message: `Error tracked: ${this.entropyCounter.get(signature) || 1}/${this.config.threshold}`,
    };
  }

  /**
   * Normalize error signature for comparison
   *
   * Removes:
   * - Line numbers and column numbers
   * - Specific values (numbers, paths)
   * - Timestamps
   * - Excess whitespace
   */
  private normalizeErrorSignature(errorMessage: string): string {
    return errorMessage
      .replace(/:\d+:\d+/g, ':X:X') // Remove line:column numbers
      .replace(/line \d+/gi, 'line X') // Remove line numbers in text
      .replace(/\d+ms/g, 'Xms') // Remove timing values
      .replace(/\d{4}-\d{2}-\d{2}/g, 'YYYY-MM-DD') // Remove dates
      .replace(/\d{2}:\d{2}:\d{2}/g, 'HH:MM:SS') // Remove times
      .replace(/\d+/g, 'N') // Replace numbers with N
      .replace(/\/[^\s]+\//g, '/PATH/') // Replace file paths
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toLowerCase();
  }

  /**
   * Get recent errors matching signature
   */
  private getRecentErrorsForSignature(signature: string): ErrorEntry[] {
    return this.errorHistory.filter(entry => entry.signature === signature);
  }

  /**
   * Get all recent errors
   */
  public getErrorHistory(): ErrorEntry[] {
    return [...this.errorHistory];
  }

  /**
   * Get entropy statistics
   */
  public getStats(): {
    totalErrors: number;
    uniqueErrors: number;
    mostCommonError: { signature: string; count: number } | null;
    entropyRatio: number; // unique errors / total errors
  } {
    const totalErrors = this.errorHistory.length;
    const uniqueErrors = this.entropyCounter.size;

    // Find most common error
    let mostCommonError: { signature: string; count: number } | null = null;
    for (const [signature, count] of this.entropyCounter.entries()) {
      if (!mostCommonError || count > mostCommonError.count) {
        mostCommonError = { signature, count };
      }
    }

    // Entropy ratio: high entropy = many unique errors, low entropy = same error repeating
    const entropyRatio = totalErrors > 0 ? uniqueErrors / totalErrors : 0;

    return {
      totalErrors,
      uniqueErrors,
      mostCommonError,
      entropyRatio,
    };
  }

  /**
   * Reset entropy tracking
   */
  public reset(): void {
    this.errorHistory = [];
    this.entropyCounter.clear();
    this.lastErrorSignature = null;
    logger.info('Entropy detector reset');
  }

  /**
   * Check if current state indicates low entropy (stuck)
   */
  public isStuck(): boolean {
    const stats = this.getStats();

    // Low entropy ratio indicates same error repeating
    const lowEntropy = stats.entropyRatio < 0.3 && stats.totalErrors >= 3;

    // Most common error is close to threshold
    const nearThreshold =
      stats.mostCommonError && stats.mostCommonError.count >= this.config.threshold - 1;

    return lowEntropy || !!nearThreshold;
  }

  /**
   * Get configuration
   */
  public getConfig(): EntropyConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<EntropyConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Entropy detector configuration updated', this.config);
  }
}

/**
 * Create entropy detector with defaults (T058)
 */
export function createEntropyDetector(config?: Partial<EntropyConfig>): EntropyDetector {
  return new EntropyDetector(config);
}

/**
 * Format entropy detection result for display
 */
export function formatEntropyResult(result: EntropyDetectionResult): string {
  const lines: string[] = [];

  if (result.entropyDetected) {
    lines.push('🛑 CIRCUIT BREAKER TRIGGERED');
    lines.push('');
    lines.push(`Identical error detected ${result.count} times (threshold: ${result.threshold})`);
    lines.push('');
    lines.push('Error Signature:');
    lines.push(`  ${result.errorSignature}`);
    lines.push('');
    lines.push('Occurrences:');
    for (const error of result.recentErrors) {
      lines.push(`  Iteration ${error.iteration}: ${error.original.substring(0, 80)}...`);
    }
    lines.push('');
    lines.push('⚠️  Manual intervention required:');
    lines.push('  - Review test expectations');
    lines.push('  - Check environment configuration');
    lines.push('  - Verify dependencies');
    lines.push('  - Adjust objective if needed');
  } else {
    lines.push(`Error tracked: ${result.count}/${result.threshold} (${result.message})`);
  }

  return lines.join('\n');
}
