/**
 * Iteration Manager - Fresh Session Lifecycle Orchestrator
 *
 * Implements the core Ralph Loop principle: fresh LLM context each iteration.
 * Each iteration:
 * 1. Reads state from disk (git working tree + test results + MemoryVault)
 * 2. Executes multi-agent workflow
 * 3. Writes changes to disk
 * 4. Destroys LLM context completely
 *
 * @module lifecycle/iteration-manager
 */

import { EventEmitter } from 'events';
import type { SessionConfig, IterationResult, IterationState } from './types';

export interface IterationManagerConfig {
  sessionId: string;
  maxIterations: number;
  maxCostUsd: number;
  maxDurationMinutes: number;
  contextResetFrequency: number; // Default: 1 (fresh every iteration)
  entropyThreshold: number; // Default: 3 (circuit breaker)
}

export interface BudgetStatus {
  currentIteration: number;
  totalCost: number;
  elapsedMinutes: number;
  withinBudget: boolean;
  reason?: string;
}

export class IterationManager extends EventEmitter {
  private config: IterationManagerConfig;
  private currentIteration: number = 0;
  private totalCost: number = 0;
  private startTime: number;
  private entropyCounter: Map<string, number> = new Map();
  private lastErrorSignature: string | null = null;

  constructor(config: IterationManagerConfig) {
    super();
    this.config = config;
    this.startTime = Date.now();

    // Warn if context reset frequency > 1 (violates Ralph Loop gold standard)
    if (config.contextResetFrequency > 1) {
      console.warn(
        `⚠️  context_reset_frequency=${config.contextResetFrequency} degrades quality`,
      );
      console.warn(
        '   Gold standard is context_reset_frequency=1 (fresh context every iteration)',
      );
      console.warn(
        '   Automatic reset will trigger at 40% context usage regardless',
      );
    }
  }

  /**
   * Check if budget constraints allow continuing
   */
  public checkBudget(): BudgetStatus {
    const elapsedMs = Date.now() - this.startTime;
    const elapsedMinutes = elapsedMs / (1000 * 60);

    // Check iteration limit
    if (this.currentIteration >= this.config.maxIterations) {
      return {
        currentIteration: this.currentIteration,
        totalCost: this.totalCost,
        elapsedMinutes,
        withinBudget: false,
        reason: `max_iterations reached (${this.config.maxIterations})`,
      };
    }

    // Check cost limit
    if (this.totalCost >= this.config.maxCostUsd) {
      return {
        currentIteration: this.currentIteration,
        totalCost: this.totalCost,
        elapsedMinutes,
        withinBudget: false,
        reason: `max_cost_usd exceeded ($${this.totalCost.toFixed(2)} / $${this.config.maxCostUsd.toFixed(2)})`,
      };
    }

    // Check duration limit
    if (elapsedMinutes >= this.config.maxDurationMinutes) {
      return {
        currentIteration: this.currentIteration,
        totalCost: this.totalCost,
        elapsedMinutes,
        withinBudget: false,
        reason: `max_duration_minutes exceeded (${elapsedMinutes.toFixed(1)} / ${this.config.maxDurationMinutes})`,
      };
    }

    return {
      currentIteration: this.currentIteration,
      totalCost: this.totalCost,
      elapsedMinutes,
      withinBudget: true,
    };
  }

  /**
   * Track error signatures for entropy detection
   * Returns true if circuit breaker should trigger
   */
  public trackError(errorSignature: string): boolean {
    // Normalize error signature (remove line numbers, specific values)
    const normalized = this.normalizeErrorSignature(errorSignature);

    // Only track if it's the same error repeating
    if (normalized === this.lastErrorSignature) {
      const count = (this.entropyCounter.get(normalized) || 0) + 1;
      this.entropyCounter.set(normalized, count);

      if (count >= this.config.entropyThreshold) {
        this.emit('entropy-detected', {
          errorSignature: normalized,
          count,
          threshold: this.config.entropyThreshold,
        });
        return true; // Circuit breaker triggered
      }
    } else {
      // Different error - reset counter
      this.entropyCounter.clear();
      this.lastErrorSignature = normalized;
      this.entropyCounter.set(normalized, 1);
    }

    return false;
  }

  /**
   * Record iteration cost
   */
  public recordCost(cost: number): void {
    this.totalCost += cost;
    this.emit('cost-update', {
      iterationCost: cost,
      totalCost: this.totalCost,
      remaining: this.config.maxCostUsd - this.totalCost,
    });
  }

  /**
   * Increment iteration counter
   */
  public incrementIteration(): number {
    this.currentIteration += 1;
    this.emit('iteration-start', {
      iteration: this.currentIteration,
      maxIterations: this.config.maxIterations,
    });
    return this.currentIteration;
  }

  /**
   * Determine if context reset should occur this iteration
   */
  public shouldResetContext(): boolean {
    // Always reset every N iterations per config
    return this.currentIteration % this.config.contextResetFrequency === 0;
  }

  /**
   * Get current iteration stats
   */
  public getStats(): {
    iteration: number;
    totalCost: number;
    elapsedMinutes: number;
    averageCostPerIteration: number;
  } {
    const elapsedMs = Date.now() - this.startTime;
    return {
      iteration: this.currentIteration,
      totalCost: this.totalCost,
      elapsedMinutes: elapsedMs / (1000 * 60),
      averageCostPerIteration:
        this.currentIteration > 0 ? this.totalCost / this.currentIteration : 0,
    };
  }

  /**
   * Reset entropy tracking (called when making progress)
   */
  public resetEntropy(): void {
    this.entropyCounter.clear();
    this.lastErrorSignature = null;
  }

  /**
   * Normalize error signature for entropy detection
   * Removes line numbers, specific values, timestamps
   */
  private normalizeErrorSignature(signature: string): string {
    return signature
      .replace(/:\d+:\d+/g, ':X:X') // Remove line:column numbers
      .replace(/\d+/g, 'N') // Replace numbers with N
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toLowerCase();
  }
}

/**
 * Factory function to create iteration manager with defaults
 */
export function createIterationManager(
  sessionId: string,
  overrides?: Partial<IterationManagerConfig>,
): IterationManager {
  const config: IterationManagerConfig = {
    sessionId,
    maxIterations: 30, // Default from spec
    maxCostUsd: 2.0, // Default from spec
    maxDurationMinutes: 15, // Default from spec
    contextResetFrequency: 1, // GOLD STANDARD - fresh every iteration
    entropyThreshold: 3, // Circuit breaker at 3 identical errors
    ...overrides,
  };

  return new IterationManager(config);
}
