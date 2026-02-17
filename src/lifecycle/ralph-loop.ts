/**
 * Ralph Loop - Main Iteration Loop with Fresh Context Resets
 *
 * T038: Integration of iteration lifecycle manager with state machine workflow
 *
 * This module implements the complete Ralph Loop lifecycle:
 * 1. Initialize session with iteration manager
 * 2. For each iteration:
 *    a. Check budget constraints
 *    b. Create FRESH state machine instance (GOLD STANDARD)
 *    c. Execute multi-agent workflow via orchestrator
 *    d. Track costs and entropy
 *    e. Persist state to disk
 *    f. DESTROY state machine context
 * 3. Repeat until success or budget exhausted
 *
 * @module lifecycle/ralph-loop
 */

import { createIterationManager, type IterationManager } from './iteration-manager';
import { createRalphOrchestrator, type RalphOrchestrator } from '../state-machine/ralph-orchestrator';
import type { RalphConfig } from '../config/schema-validator';
import type { PluginRegistryEntry } from '../plugins/sdk/plugin.interface';
import { StatePersister } from './state-persister';
import { createLogger } from '../utils/logger';
import type { OrchestrationResult } from '../state-machine/ralph-orchestrator';
import type { MemoryVault } from '../memory/memory-vault';

const logger = createLogger();

export interface RalphLoopConfig {
  sessionId: string;
  targetFile: string;
  objective: string;
  config: RalphConfig;
  plugins?: PluginRegistryEntry[];
}

export interface RalphLoopResult {
  success: boolean;
  sessionId: string;
  iterations: number;
  totalCost: number;
  duration: number;
  finalState: string;
  reason: string;
  testsPassed?: boolean;
  adversarialPassed?: boolean;
}

/**
 * Ralph Loop - Complete Iteration Lifecycle
 *
 * Integrates iteration manager with state machine orchestrator
 * to implement the full Ralph Loop workflow with fresh context resets.
 */
export class RalphLoop {
  private iterationManager: IterationManager;
  private orchestrator: RalphOrchestrator;
  private statePersister: StatePersister;
  private config: RalphLoopConfig;
  private memoryVault?: MemoryVault;
  private previousErrors: string[] = []; // Track errors from previous iterations

  constructor(config: RalphLoopConfig) {
    this.config = config;

    // Create iteration manager with budget constraints (T054 integration)
    this.iterationManager = createIterationManager(config.sessionId, {
      maxIterations: config.config.maxIterations,
      maxCostUsd: config.config.costLimit,
      maxDurationMinutes: config.config.timeLimit / 60000, // Convert ms to minutes
      entropyThreshold: config.config.entropy?.threshold || 3,
    });

    // Create state machine orchestrator
    this.orchestrator = createRalphOrchestrator();

    // Create state persister (T050 integration)
    this.statePersister = new StatePersister({
      sessionId: config.sessionId,
      projectRoot: process.cwd(),
      ralphDir: '.ralph',
    });

    // Wire agents to orchestrator (already done in T035-T037)
    // Agents are wired externally before calling run()

    logger.info('Micro Agent initialized (Ralph Loop engine)', {
      sessionId: config.sessionId,
      targetFile: config.targetFile,
      maxIterations: config.config.maxIterations,
      maxCost: config.config.costLimit,
    });
  }

  /**
   * Wire agent to orchestrator
   */
  public wireAgent(agentType: 'librarian' | 'artisan' | 'critic' | 'chaos', agent: any): void {
    switch (agentType) {
      case 'librarian':
        this.orchestrator.wireLibrarianAgent(agent);
        break;
      case 'artisan':
        this.orchestrator.wireArtisanAgent(agent);
        break;
      case 'critic':
        this.orchestrator.wireCriticAgent(agent);
        break;
      case 'chaos':
        this.orchestrator.wireChaosAgent(agent);
        break;
    }
  }

  /**
   * Wire MemoryVault for error learning and fix recording (T063, T064)
   */
  public wireMemoryVault(memoryVault: MemoryVault): void {
    this.memoryVault = memoryVault;
    logger.info('MemoryVault wired to Micro Agent');
  }

  /**
   * Run complete Ralph Loop until success or budget exhausted
   */
  public async run(): Promise<RalphLoopResult> {
    const sessionStartTime = Date.now();

    // T050: Initialize session directory for persistence
    await this.statePersister.initialize();

    logger.info('🤖 Micro Agent session starting (Ralph Loop engine)', {
      sessionId: this.config.sessionId,
      targetFile: this.config.targetFile,
    });

    let testsPassed = false;
    let adversarialPassed = false;
    let finalState = 'incomplete';
    let reason = 'Unknown';

    // Main iteration loop
    while (true) {
      // Check budget constraints (T054)
      const budgetStatus = this.iterationManager.checkBudget();

      if (!budgetStatus.withinBudget) {
        logger.warn('❌ Budget constraints exceeded', budgetStatus);
        reason = budgetStatus.reason || 'Budget exceeded';
        finalState = 'budget_exceeded';
        break;
      }

      // Increment iteration
      const iteration = this.iterationManager.incrementIteration();

      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`🔄 Iteration ${iteration} / ${this.config.config.maxIterations}`);
      logger.info(`${'='.repeat(60)}\n`);

      // Fresh context reset check (GOLD STANDARD)
      const shouldReset = this.iterationManager.shouldResetContext();
      if (shouldReset) {
        logger.info('🔄 Fresh context reset (GOLD STANDARD)');
      }

      try {
        // Execute ONE iteration with FRESH state machine instance
        // This is the GOLD STANDARD: Each iteration gets a completely new machine
        const result = await this.executeIteration(iteration);

        // Record cost
        if (result.cost) {
          this.iterationManager.recordCost(result.cost);
        }

        // Persist iteration state to disk
        await this.statePersister.persistIterationState(iteration, {
          iteration,
          state: result.finalState,
          context: result.context,
          duration: result.duration,
          timestamp: new Date().toISOString(),
        });

        // T050: Persist test results to dedicated file
        if (result.context.testResults) {
          const testResultsPath = await this.statePersister.persistTestResults(
            iteration,
            result.context.testResults
          );
          logger.debug('Test results persisted', { path: testResultsPath });
        }

        // Check success criteria (T053 integration)
        if (result.finalState === 'completion') {
          // Extract test results from context
          const testResults = result.context.testResults;
          testsPassed = testResults?.passed || false;

          if (testsPassed) {
            logger.info('✅ Tests passed!');

            // T064: Record successful fix to MemoryVault
            if (this.memoryVault && this.previousErrors.length > 0) {
              await this.recordSuccessfulFix(
                this.previousErrors,
                result.context.artisanOutput,
                iteration
              );
            }

            // Check if adversarial tests ran
            const adversarialResults = result.context.adversarialResults;
            if (adversarialResults) {
              adversarialPassed = adversarialResults.passed || false;
              if (adversarialPassed) {
                logger.info('✅ Adversarial tests passed!');
              } else {
                logger.warn('⚠️  Adversarial tests failed (informational only)');
              }
            }

            // Success! Tests passed
            reason = 'Tests passed successfully';
            finalState = 'success';
            break;
          } else {
            logger.warn('❌ Tests failed, continuing iteration...');

            // Track error for entropy detection (T057)
            const errorSignature = this.extractErrorSignature(testResults);

            // Store error for fix recording (T064)
            this.previousErrors.push(errorSignature);

            const entropyDetected = this.iterationManager.trackError(errorSignature);

            if (entropyDetected) {
              logger.error('🛑 Circuit breaker triggered - identical errors repeating');
              reason = 'Entropy detected (circuit breaker)';
              finalState = 'entropy_detected';
              break;
            }
          }
        } else if (result.finalState === 'error') {
          logger.error('❌ State machine error');

          // Track error for entropy detection
          const errorSignature = result.context.errors.join(' | ');
          const entropyDetected = this.iterationManager.trackError(errorSignature);

          if (entropyDetected) {
            logger.error('🛑 Circuit breaker triggered - identical errors repeating');
            reason = 'Entropy detected (circuit breaker)';
            finalState = 'entropy_detected';
            break;
          }
        }

        // Continue to next iteration
        logger.info(`Iteration ${iteration} complete, continuing...`);

        // CRITICAL: State machine instance is destroyed here when result goes out of scope
        // Next iteration will create a FRESH instance (GOLD STANDARD)
      } catch (error) {
        logger.error(`Iteration ${iteration} failed with exception:`, error);

        // Track error for entropy detection
        const errorSignature = error instanceof Error ? error.message : String(error);
        const entropyDetected = this.iterationManager.trackError(errorSignature);

        if (entropyDetected) {
          logger.error('🛑 Circuit breaker triggered');
          reason = 'Entropy detected (circuit breaker)';
          finalState = 'entropy_detected';
          break;
        }

        // Continue to next iteration if within budget
      }
    }

    // Calculate final statistics
    const sessionDuration = Date.now() - sessionStartTime;
    const stats = this.iterationManager.getStats();

    logger.info('\n' + '='.repeat(60));
    logger.info('📊 Micro Agent Session Complete');
    logger.info('='.repeat(60));
    logger.info(`Final State: ${finalState}`);
    logger.info(`Reason: ${reason}`);
    logger.info(`Iterations: ${stats.iteration}`);
    logger.info(`Total Cost: $${stats.totalCost.toFixed(2)}`);
    logger.info(`Duration: ${(sessionDuration / 1000).toFixed(1)}s`);
    logger.info(`Tests Passed: ${testsPassed ? '✅' : '❌'}`);
    if (adversarialPassed !== undefined) {
      logger.info(`Adversarial Passed: ${adversarialPassed ? '✅' : '⚠️'}`);
    }
    logger.info('='.repeat(60) + '\n');

    return {
      success: finalState === 'success',
      sessionId: this.config.sessionId,
      iterations: stats.iteration,
      totalCost: stats.totalCost,
      duration: sessionDuration,
      finalState,
      reason,
      testsPassed,
      adversarialPassed,
    };
  }

  /**
   * Execute a single iteration with fresh state machine instance
   */
  private async executeIteration(iteration: number): Promise<{
    finalState: string;
    context: any;
    duration: number;
    cost?: number;
  }> {
    logger.info(`Executing iteration ${iteration} with FRESH state machine...`);

    // Execute orchestration
    // The orchestrator creates a FRESH machine instance internally
    const result = await this.orchestrator.run(
      this.config.sessionId,
      iteration,
      this.config.targetFile,
      this.config.objective,
      this.config.config,
      this.config.plugins || []
    );

    // Calculate cost (placeholder - will be implemented with cost tracker)
    const cost = this.estimateCost(result);

    return {
      finalState: result.finalState,
      context: result.context,
      duration: result.duration,
      cost,
    };
  }

  /**
   * Extract error signature from test results for entropy tracking
   */
  private extractErrorSignature(testResults: any): string {
    if (!testResults || !testResults.failures) {
      return 'unknown-error';
    }

    // Combine error messages from all failures
    const errors = testResults.failures.map((f: any) => f.message || f.error || 'unknown');
    return errors.join(' | ');
  }

  /**
   * Estimate cost of iteration (placeholder for T054 cost tracking)
   */
  private estimateCost(result: OrchestrationResult): number {
    // Placeholder: Estimate based on duration
    // Real implementation will use cost tracker with actual token counts
    const baseCost = 0.01; // $0.01 base per iteration
    const durationCost = (result.duration / 1000) * 0.001; // $0.001 per second
    return baseCost + durationCost;
  }

  /**
   * Record successful fix to MemoryVault (T064)
   */
  private async recordSuccessfulFix(
    errorSignatures: string[],
    artisanOutput: any,
    iteration: number
  ): Promise<void> {
    if (!this.memoryVault) {
      return;
    }

    logger.info('📝 Recording successful fix to MemoryVault', {
      errorCount: errorSignatures.length,
      iteration,
    });

    try {
      // Extract solution from artisan output
      const solution = artisanOutput?.reasoning || artisanOutput?.code || 'Code fix applied';

      // Record fix for each error that was resolved
      for (const errorSignature of errorSignatures) {
        await this.memoryVault.recordFix({
          errorCategory: this.categorizeError(errorSignature),
          errorSignature,
          solution,
          successRate: 1.0, // First success
          metadata: {
            iteration,
            sessionId: this.config.sessionId,
            objective: this.config.objective,
            targetFile: this.config.targetFile,
          },
        });
      }

      logger.info('✅ Successful fix recorded to MemoryVault', {
        errorsResolved: errorSignatures.length,
      });

      // Clear previous errors after recording
      this.previousErrors = [];
    } catch (error) {
      logger.error('Failed to record fix to MemoryVault', error);
      // Don't throw - this is non-critical logging
    }
  }

  /**
   * Categorize error for MemoryVault storage (T064)
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
   * Get current iteration statistics
   */
  public getStats() {
    return this.iterationManager.getStats();
  }
}

/**
 * Create Ralph Loop instance
 */
export function createRalphLoop(config: RalphLoopConfig): RalphLoop {
  return new RalphLoop(config);
}
