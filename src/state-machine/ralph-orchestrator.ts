/**
 * Ralph Loop State Machine Orchestrator
 *
 * Wires agents to state machine states and orchestrates
 * the complete multi-agent workflow.
 *
 * Responsibilities:
 * - Interprets state machine events
 * - Invokes appropriate agents at each state
 * - Manages plugin hook execution
 * - Handles errors and transitions
 *
 * @module state-machine/ralph-orchestrator
 */

import { createActor } from 'xstate';
import { createRalphMachine, type RalphContext } from './ralph-machine';
import type { RalphConfig } from '../config/schema-validator';
import type { PluginRegistryEntry } from '../plugins/sdk/plugin.interface';
import { HookExecutor } from '../plugins/hook-executor';
import { createLogger } from '../utils/logger';

// Import agents (these will be wired in)
import type { LibrarianAgent } from '../agents/librarian/librarian.agent';
import type { ArtisanAgent } from '../agents/artisan/artisan.agent';
import type { CriticAgent } from '../agents/critic/critic.agent';
import type { ChaosAgent } from '../agents/chaos/chaos.agent';

const logger = createLogger();

export interface OrchestrationResult {
  success: boolean;
  finalState: string;
  context: RalphContext;
  duration: number;
  error?: Error;
}

/**
 * Ralph Loop Orchestrator
 *
 * Coordinates state machine with agent execution
 */
export class RalphOrchestrator {
  private hookExecutor: HookExecutor;
  private librarianAgent?: LibrarianAgent;
  private artisanAgent?: ArtisanAgent;
  private criticAgent?: CriticAgent;
  private chaosAgent?: ChaosAgent;

  constructor() {
    this.hookExecutor = new HookExecutor();
  }

  /**
   * Wire Librarian agent to orchestrator (T035)
   */
  wireLibrarianAgent(agent: LibrarianAgent): void {
    this.librarianAgent = agent;
    logger.info('✓ Librarian agent wired to state machine');
  }

  /**
   * Wire Artisan agent to orchestrator (T036)
   */
  wireArtisanAgent(agent: ArtisanAgent): void {
    this.artisanAgent = agent;
    logger.info('✓ Artisan agent wired to state machine');
  }

  /**
   * Wire Critic agent to orchestrator (T037)
   */
  wireCriticAgent(agent: CriticAgent): void {
    this.criticAgent = agent;
    logger.info('✓ Critic agent wired to state machine');
  }

  /**
   * Wire Chaos agent to orchestrator
   */
  wireChaosAgent(agent: ChaosAgent): void {
    this.chaosAgent = agent;
    logger.info('✓ Chaos agent wired to state machine');
  }

  /**
   * Run complete Ralph Loop iteration
   */
  async run(
    sessionId: string,
    iteration: number,
    targetFile: string,
    objective: string,
    config: RalphConfig,
    plugins: PluginRegistryEntry[] = []
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();

    logger.info(`Starting Ralph Loop iteration ${iteration}`, {
      sessionId,
      targetFile,
      objective,
    });

    // Create fresh machine instance (GOLD STANDARD: Fresh Context Reset)
    const machine = createRalphMachine(
      sessionId,
      iteration,
      targetFile,
      objective,
      config,
      plugins
    );

    // Create actor
    const actor = createActor(machine);

    // Subscribe to state transitions
    actor.subscribe(state => {
      logger.debug(`State transition: ${state.value as string}`, {
        context: state.context,
      });
    });

    // Start actor
    actor.start();

    try {
      // Get current state
      const snapshot = actor.getSnapshot();
      const currentState = snapshot.value as string;

      // Execute state machine with agent orchestration
      const finalState = await this.executeStateMachine(actor, plugins);

      const duration = Date.now() - startTime;
      const finalSnapshot = actor.getSnapshot();

      logger.info(`Ralph Loop iteration ${iteration} completed`, {
        finalState,
        duration,
        success: finalState === 'completion',
      });

      // Stop actor
      actor.stop();

      return {
        success: finalState === 'completion',
        finalState,
        context: finalSnapshot.context,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const finalSnapshot = actor.getSnapshot();

      logger.error(`Ralph Loop iteration ${iteration} failed`, error);

      // Stop actor
      actor.stop();

      return {
        success: false,
        finalState: 'error',
        context: finalSnapshot.context,
        duration,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Execute state machine with agent orchestration
   */
  private async executeStateMachine(
    actor: any,
    plugins: PluginRegistryEntry[]
  ): Promise<string> {
    // State machine will transition through states
    // We need to execute agents at each state

    while (true) {
      const snapshot = actor.getSnapshot();
      const currentState = snapshot.value as string;
      const context = snapshot.context;

      // Check if final state
      if (currentState === 'completion' || currentState === 'error') {
        return currentState;
      }

      // Execute agent for current state
      try {
        switch (currentState) {
          case 'librarian':
            await this.executeLibrarianState(actor, context, plugins);
            break;

          case 'artisan':
            await this.executeArtisanState(actor, context, plugins);
            break;

          case 'critic':
            await this.executeCriticState(actor, context, plugins);
            break;

          case 'testing':
            await this.executeTestingState(actor, context, plugins);
            break;

          case 'adversarial':
            await this.executeAdversarialState(actor, context, plugins);
            break;

          default:
            throw new Error(`Unknown state: ${currentState}`);
        }

        // Wait for state transition
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`Error in state ${currentState}:`, error);

        // Send error event to transition to error state
        const errorEvent =
          currentState === 'librarian'
            ? 'LIBRARIAN_ERROR'
            : currentState === 'artisan'
              ? 'ARTISAN_ERROR'
              : currentState === 'critic'
                ? 'CRITIC_ERROR'
                : 'TESTS_FAIL';

        actor.send({
          type: errorEvent,
          error: error instanceof Error ? error.message : String(error),
        });

        return 'error';
      }
    }
  }

  /**
   * Execute Librarian state (T035)
   */
  private async executeLibrarianState(
    actor: any,
    context: RalphContext,
    plugins: PluginRegistryEntry[]
  ): Promise<void> {
    logger.info('Executing Librarian agent...');

    if (!this.librarianAgent) {
      throw new Error('Librarian agent not wired');
    }

    // Execute plugin hooks: onBeforeGen
    await this.hookExecutor.executeHook(
      'onBeforeGen',
      plugins,
      this.createPluginContext(context)
    );

    // Execute Librarian agent
    const result = await this.librarianAgent.execute({
      sessionId: context.sessionId,
      iteration: context.iteration,
      targetFile: context.targetFile,
      objective: context.objective,
      codebaseFiles: context.codebaseFiles,
    });

    // Send success event to state machine
    actor.send({
      type: 'LIBRARIAN_SUCCESS',
      output: result,
    });

    logger.info('Librarian agent completed successfully');
  }

  /**
   * Execute Artisan state (T036)
   */
  private async executeArtisanState(
    actor: any,
    context: RalphContext,
    plugins: PluginRegistryEntry[]
  ): Promise<void> {
    logger.info('Executing Artisan agent...');

    if (!this.artisanAgent) {
      throw new Error('Artisan agent not wired');
    }

    // Execute Artisan agent
    const result = await this.artisanAgent.execute({
      sessionId: context.sessionId,
      iteration: context.iteration,
      targetFile: context.targetFile,
      objective: context.objective,
      librarianOutput: context.librarianOutput,
    });

    // Execute plugin hooks: onAfterGen
    await this.hookExecutor.executeHook(
      'onAfterGen',
      plugins,
      this.createPluginContext(context),
      result
    );

    // Send success event to state machine
    actor.send({
      type: 'ARTISAN_SUCCESS',
      output: result,
    });

    logger.info('Artisan agent completed successfully');
  }

  /**
   * Execute Critic state (T037)
   */
  private async executeCriticState(
    actor: any,
    context: RalphContext,
    plugins: PluginRegistryEntry[]
  ): Promise<void> {
    logger.info('Executing Critic agent...');

    if (!this.criticAgent) {
      throw new Error('Critic agent not wired');
    }

    // Execute Critic agent
    const result = await this.criticAgent.execute({
      sessionId: context.sessionId,
      iteration: context.iteration,
      targetFile: context.targetFile,
      artisanOutput: context.artisanOutput,
    });

    // Send success event to state machine
    actor.send({
      type: 'CRITIC_SUCCESS',
      output: result,
    });

    logger.info('Critic agent completed successfully');
  }

  /**
   * Execute Testing state
   */
  private async executeTestingState(
    actor: any,
    context: RalphContext,
    plugins: PluginRegistryEntry[]
  ): Promise<void> {
    logger.info('Executing tests...');

    // This will be implemented when test framework detector is wired
    // For now, simulate test execution
    const testResults = {
      passed: true,
      total: 0,
      failed: 0,
      skipped: 0,
    };

    if (testResults.passed) {
      actor.send({
        type: 'TESTS_PASS',
        results: testResults,
      });
    } else {
      // Execute plugin hooks: onTestFail
      await this.hookExecutor.executeHook(
        'onTestFail',
        plugins,
        this.createPluginContext(context),
        testResults
      );

      actor.send({
        type: 'TESTS_FAIL',
        results: testResults,
      });
    }

    logger.info('Testing completed');
  }

  /**
   * Execute Adversarial state
   */
  private async executeAdversarialState(
    actor: any,
    context: RalphContext,
    plugins: PluginRegistryEntry[]
  ): Promise<void> {
    logger.info('Executing Chaos agent (adversarial testing)...');

    if (!this.chaosAgent) {
      logger.warn('Chaos agent not wired, skipping adversarial tests');
      actor.send({
        type: 'ADVERSARIAL_SUCCESS',
        results: { skipped: true },
      });
      return;
    }

    // Execute Chaos agent
    const result = await this.chaosAgent.execute({
      sessionId: context.sessionId,
      iteration: context.iteration,
      targetFile: context.targetFile,
      artisanOutput: context.artisanOutput,
    });

    // Send result event
    if (result.success) {
      actor.send({
        type: 'ADVERSARIAL_SUCCESS',
        results: result,
      });
    } else {
      actor.send({
        type: 'ADVERSARIAL_FAIL',
        results: result,
      });
    }

    logger.info('Adversarial testing completed');
  }

  /**
   * Create plugin context from Ralph context
   */
  private createPluginContext(context: RalphContext): any {
    return {
      sessionId: context.sessionId,
      iteration: context.iteration,
      targetFile: context.targetFile,
      objective: context.objective,
    };
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    librarianWired: boolean;
    artisanWired: boolean;
    criticWired: boolean;
    chaosWired: boolean;
  } {
    return {
      librarianWired: !!this.librarianAgent,
      artisanWired: !!this.artisanAgent,
      criticWired: !!this.criticAgent,
      chaosWired: !!this.chaosAgent,
    };
  }
}

/**
 * Create Ralph orchestrator instance
 */
export function createRalphOrchestrator(): RalphOrchestrator {
  return new RalphOrchestrator();
}
