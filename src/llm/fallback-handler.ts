/**
 * Fallback Handler - Provider Failover
 *
 * Implements fallback routing when primary provider fails:
 * - Gemini → Claude → GPT on API errors
 * - Exponential backoff for transient failures
 * - Request queuing for rate limits
 *
 * @module llm/fallback-handler
 */

import { EventEmitter } from 'events';
import type { CompletionRequest, CompletionResponse } from './provider-router';

export interface FallbackConfig {
  maxRetries: number; // Per provider
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
}

export interface ProviderFailure {
  provider: string;
  error: string;
  timestamp: number;
  retryCount: number;
}

export type ProviderRequestFn = (
  request: CompletionRequest,
) => Promise<CompletionResponse>;

export class FallbackHandler extends EventEmitter {
  private config: FallbackConfig;
  private providerChain: string[] = [];
  private providerFunctions: Map<string, ProviderRequestFn> = new Map();
  private failures: ProviderFailure[] = [];

  constructor(config?: Partial<FallbackConfig>) {
    super();
    this.config = {
      maxRetries: 3,
      initialBackoffMs: 1000,
      maxBackoffMs: 30000,
      backoffMultiplier: 2,
      ...config,
    };
  }

  /**
   * Register provider chain in order of preference
   */
  public setProviderChain(chain: string[]): void {
    this.providerChain = chain;
  }

  /**
   * Register provider request function
   */
  public registerProvider(name: string, requestFn: ProviderRequestFn): void {
    this.providerFunctions.set(name, requestFn);
  }

  /**
   * Execute request with automatic failover
   */
  public async executeWithFallback(
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    if (this.providerChain.length === 0) {
      throw new Error('No providers configured in fallback chain');
    }

    let lastError: Error | null = null;

    for (const provider of this.providerChain) {
      const requestFn = this.providerFunctions.get(provider);
      if (!requestFn) {
        console.warn(`Provider "${provider}" not registered, skipping`);
        continue;
      }

      this.emit('fallback-attempt', { provider, request });

      try {
        const response = await this.executeWithRetry(
          provider,
          requestFn,
          request,
        );
        this.emit('fallback-success', { provider, response });
        return response;
      } catch (error) {
        lastError = error as Error;
        this.recordFailure(provider, String(error));
        this.emit('fallback-error', {
          provider,
          error: String(error),
          nextProvider: this.getNextProvider(provider),
        });

        // Continue to next provider in chain
        console.warn(`Provider "${provider}" failed, trying next...`);
      }
    }

    // All providers failed
    this.emit('fallback-exhausted', {
      providers: this.providerChain,
      lastError: String(lastError),
    });

    throw new Error(
      `All providers failed. Last error: ${lastError?.message || 'Unknown error'}`,
    );
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry(
    provider: string,
    requestFn: ProviderRequestFn,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await requestFn(request);
      } catch (error) {
        lastError = error as Error;

        if (this.isRetryable(error as Error)) {
          const backoff = this.calculateBackoff(attempt);
          this.emit('retry-attempt', {
            provider,
            attempt: attempt + 1,
            maxRetries: this.config.maxRetries,
            backoffMs: backoff,
          });

          await this.sleep(backoff);
        } else {
          // Non-retryable error, fail fast
          throw error;
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Determine if error is retryable
   */
  private isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Retryable errors
    if (message.includes('rate limit')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('503')) return true; // Service unavailable
    if (message.includes('429')) return true; // Too many requests
    if (message.includes('connection')) return true;

    // Non-retryable errors
    if (message.includes('401')) return false; // Unauthorized
    if (message.includes('403')) return false; // Forbidden
    if (message.includes('invalid')) return false;
    if (message.includes('not found')) return false;

    // Default to not retryable
    return false;
  }

  /**
   * Calculate exponential backoff
   */
  private calculateBackoff(attempt: number): number {
    const backoff =
      this.config.initialBackoffMs *
      Math.pow(this.config.backoffMultiplier, attempt);
    return Math.min(backoff, this.config.maxBackoffMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get next provider in chain
   */
  private getNextProvider(current: string): string | null {
    const index = this.providerChain.indexOf(current);
    if (index === -1 || index === this.providerChain.length - 1) {
      return null;
    }
    return this.providerChain[index + 1];
  }

  /**
   * Record provider failure
   */
  private recordFailure(provider: string, error: string): void {
    // Find existing failure for this provider
    const existing = this.failures.find(
      (f) => f.provider === provider && Date.now() - f.timestamp < 60000,
    );

    if (existing) {
      existing.retryCount++;
      existing.timestamp = Date.now();
    } else {
      this.failures.push({
        provider,
        error,
        timestamp: Date.now(),
        retryCount: 1,
      });
    }

    // Clean up old failures (older than 5 minutes)
    this.failures = this.failures.filter(
      (f) => Date.now() - f.timestamp < 300000,
    );
  }

  /**
   * Get failure statistics
   */
  public getFailureStats(): Map<string, number> {
    const stats = new Map<string, number>();

    for (const failure of this.failures) {
      const count = stats.get(failure.provider) || 0;
      stats.set(failure.provider, count + 1);
    }

    return stats;
  }

  /**
   * Get recent failures
   */
  public getRecentFailures(maxAge: number = 60000): ProviderFailure[] {
    return this.failures.filter((f) => Date.now() - f.timestamp < maxAge);
  }

  /**
   * Reset failure tracking
   */
  public reset(): void {
    this.failures = [];
    this.emit('reset');
  }
}

/**
 * Factory function to create fallback handler
 */
export function createFallbackHandler(
  config?: Partial<FallbackConfig>,
): FallbackHandler {
  return new FallbackHandler(config);
}
