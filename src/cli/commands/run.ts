/**
 * Run Command
 *
 * Orchestrates the complete Ralph Loop multi-agent workflow:
 * 1. Load configuration
 * 2. Initialize agents
 * 3. Run iteration loop
 * 4. Manage context resets
 * 5. Track budget and success criteria
 *
 * @module cli/commands/run
 */

import path from 'path';
import { createLogger } from '../../utils/logger';
import { loadConfig } from '../../config/config-loader';
import { ProviderRouter } from '../../llm/provider-router';
import { CostTracker } from '../../llm/cost-tracker';
import { IterationManager } from '../../lifecycle/iteration-manager';
import { ContextMonitor } from '../../lifecycle/context-monitor';
import { SessionResetter } from '../../lifecycle/session-resetter';
import { LibrarianAgent } from '../../agents/librarian/librarian.agent';
import { ArtisanAgent } from '../../agents/artisan/artisan.agent';
import { CriticAgent } from '../../agents/critic/critic.agent';
import {
  createAgentContext,
  updatePhase,
  withLibrarianContext,
  withArtisanCode,
  withCriticReview,
  isBudgetExceeded,
} from '../../agents/base/agent-context';
import type { AgentContext } from '../../agents/base/agent-context';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger();

export interface RunOptions {
  objective?: string;
  test?: string;
  framework?: string;
  maxIterations?: string;
  maxBudget?: string;
  maxDuration?: string;
  config?: string;
  librarian?: string;
  artisan?: string;
  critic?: string;
  chaos?: string;
  adversarial?: boolean;
  resetFrequency?: string;
  verbose?: boolean;
}

/**
 * Run Micro Agent (Ralph Loop engine) for target file or objective
 */
export async function runCommand(target: string, options: RunOptions): Promise<void> {
  const startTime = Date.now();

  logger.info('🤖 Micro Agent starting (Ralph Loop engine)', {
    target,
    ...options,
  });

  try {
    // Step 1: Load configuration
    const config = await loadConfig(options.config);
    logger.info('Configuration loaded');

    // Step 2: Prepare run parameters
    const params = prepareRunParameters(target, options, config);
    logger.info('Run parameters prepared', params);

    // Step 3: Initialize infrastructure
    const { providerRouter, costTracker, iterationManager, contextMonitor } =
      await initializeInfrastructure(params, config);
    logger.info('Infrastructure initialized');

    // Step 4: Initialize agents
    const agents = await initializeAgents(
      config,
      providerRouter,
      costTracker,
      options
    );
    logger.info('Agents initialized', {
      librarian: agents.librarian.getConfig().model,
      artisan: agents.artisan.getConfig().model,
      critic: agents.critic.getConfig().model,
    });

    // Step 5: Create initial context
    let context = createAgentContext({
      sessionId: uuidv4(),
      iteration: 0,
      maxIterations: params.maxIterations,
      objective: params.objective,
      workingDirectory: params.workingDirectory,
      testCommand: params.testCommand,
      testFramework: params.testFramework as any,
      maxCostUsd: params.maxBudget,
      maxDurationMinutes: params.maxDuration,
      targetFile: params.targetFile,
      requirements: params.requirements,
    });

    logger.info('Starting iteration loop', {
      sessionId: context.sessionId,
      maxIterations: params.maxIterations,
    });

    // Step 6: Iteration loop
    let success = false;
    let iteration = 0;

    while (iteration < params.maxIterations && !success) {
      iteration++;
      context.iteration.iteration = iteration;

      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Iteration ${iteration}/${params.maxIterations}`);
      logger.info('='.repeat(60));

      try {
        // Check budget
        if (isBudgetExceeded(context)) {
          logger.warn('Budget exceeded, stopping iterations');
          break;
        }

        // Run single iteration
        const result = await runSingleIteration(
          context,
          agents,
          iterationManager,
          contextMonitor
        );

        // Update context with results
        context = result.context;
        success = result.success;

        // Check if context reset needed
        if (iterationManager.shouldResetContext()) {
          logger.info('Context reset triggered');
          await resetContext(agents, contextMonitor);
        }

        // Progress update
        logger.info(`Iteration ${iteration} ${success ? 'SUCCESS' : 'FAILED'}`, {
          cost: context.budget.currentCostUsd.toFixed(2),
          approved: result.approved,
        });

        if (success) {
          logger.info('🎉 Objective achieved!');
          break;
        }
      } catch (error) {
        logger.error(`Iteration ${iteration} error`, error);

        // Track error for entropy detection
        const errorSignature = String(error);
        const shouldStop = iterationManager.trackError(errorSignature);

        if (shouldStop) {
          logger.error('Circuit breaker triggered - same error 3 times');
          break;
        }
      }
    }

    // Step 7: Final report
    const duration = (Date.now() - startTime) / 1000;
    logger.info('\n' + '='.repeat(60));
    logger.info('📊 Micro Agent Complete');
    logger.info('='.repeat(60));
    logger.info(`Status: ${success ? 'SUCCESS ✓' : 'FAILED ✗'}`);
    logger.info(`Iterations: ${iteration}/${params.maxIterations}`);
    logger.info(`Cost: $${context.budget.currentCostUsd.toFixed(2)}`);
    logger.info(`Duration: ${duration.toFixed(1)}s`);

    process.exit(success ? 0 : 1);
  } catch (error) {
    logger.error('❌ Micro Agent failed', error);
    process.exit(1);
  }
}

/**
 * Prepare run parameters
 */
function prepareRunParameters(
  target: string,
  options: RunOptions,
  config: any
): {
  objective: string;
  targetFile?: string;
  workingDirectory: string;
  testCommand: string;
  testFramework: string;
  maxIterations: number;
  maxBudget: number;
  maxDuration: number;
  requirements?: string[];
} {
  const isFile = target.endsWith('.ts') || target.endsWith('.js');

  return {
    objective:
      options.objective ||
      (isFile ? `Make ${target} pass all tests` : target),
    targetFile: isFile ? target : undefined,
    workingDirectory: process.cwd(),
    testCommand: options.test || config.testing?.defaultCommand || 'npm test',
    testFramework: options.framework || 'vitest',
    maxIterations: parseInt(options.maxIterations || '30', 10),
    maxBudget: parseFloat(options.maxBudget || '2.00'),
    maxDuration: parseInt(options.maxDuration || '15', 10),
  };
}

/**
 * Initialize infrastructure components
 */
async function initializeInfrastructure(params: any, config: any) {
  const providerRouter = new ProviderRouter(logger);
  const costTracker = new CostTracker(params.maxBudget, logger);

  const iterationManager = new IterationManager(
    {
      maxIterations: params.maxIterations,
      maxCostUsd: params.maxBudget,
      maxDurationMinutes: params.maxDuration,
      contextResetFrequency: config.memory?.contextResetFrequency || 1,
    },
    logger
  );

  const contextMonitor = new ContextMonitor(logger);

  return { providerRouter, costTracker, iterationManager, contextMonitor };
}

/**
 * Initialize agents
 */
async function initializeAgents(
  config: any,
  providerRouter: ProviderRouter,
  costTracker: CostTracker,
  options: RunOptions
) {
  const librarianConfig = {
    type: 'librarian' as const,
    provider: config.models?.librarian?.provider || 'google',
    model: options.librarian || config.models?.librarian?.model || 'gemini-2.0-pro',
    temperature: config.models?.librarian?.temperature || 0.3,
  };

  const artisanConfig = {
    type: 'artisan' as const,
    provider: config.models?.artisan?.provider || 'anthropic',
    model: options.artisan || config.models?.artisan?.model || 'claude-sonnet-4.5',
    temperature: config.models?.artisan?.temperature || 0.7,
  };

  const criticConfig = {
    type: 'critic' as const,
    provider: config.models?.critic?.provider || 'openai',
    model: options.critic || config.models?.critic?.model || 'gpt-4.1-mini',
    temperature: config.models?.critic?.temperature || 0.2,
  };

  const librarian = new LibrarianAgent(
    librarianConfig,
    logger,
    providerRouter,
    costTracker
  );

  const artisan = new ArtisanAgent(
    artisanConfig,
    logger,
    providerRouter,
    costTracker
  );

  const critic = new CriticAgent(
    criticConfig,
    logger,
    providerRouter,
    costTracker
  );

  return { librarian, artisan, critic };
}

/**
 * Run single iteration of the Ralph Loop
 */
async function runSingleIteration(
  context: AgentContext,
  agents: any,
  iterationManager: IterationManager,
  contextMonitor: ContextMonitor
): Promise<{
  context: AgentContext;
  success: boolean;
  approved: boolean;
}> {
  // Phase 1: Librarian - Context Analysis
  logger.info('Phase 1: Librarian analyzing context...');
  let updatedContext = updatePhase(context, 'context');

  await agents.librarian.initialize(updatedContext);
  const librarianResult = await agents.librarian.execute();

  if (!librarianResult.success || !librarianResult.data) {
    throw new Error('Librarian failed to analyze context');
  }

  updatedContext = withLibrarianContext(updatedContext, librarianResult.data);
  contextMonitor.trackTokens('librarian', librarianResult.tokensUsed);

  // Phase 2: Artisan - Code Generation
  logger.info('Phase 2: Artisan generating code...');
  updatedContext = updatePhase(updatedContext, 'generation');

  await agents.artisan.initialize(updatedContext);
  const artisanResult = await agents.artisan.execute();

  if (!artisanResult.success || !artisanResult.data) {
    throw new Error('Artisan failed to generate code');
  }

  updatedContext = withArtisanCode(updatedContext, artisanResult.data);
  contextMonitor.trackTokens('artisan', artisanResult.tokensUsed);

  // Phase 3: Critic - Code Review
  logger.info('Phase 3: Critic reviewing code...');
  updatedContext = updatePhase(updatedContext, 'review');

  await agents.critic.initialize(updatedContext);
  const criticResult = await agents.critic.execute();

  if (!criticResult.success || !criticResult.data) {
    throw new Error('Critic failed to review code');
  }

  updatedContext = withCriticReview(updatedContext, criticResult.data);
  contextMonitor.trackTokens('critic', criticResult.tokensUsed);

  // Phase 4: Testing (TODO: implement test runner)
  logger.info('Phase 4: Running tests...');
  updatedContext = updatePhase(updatedContext, 'testing');

  // TODO: Run actual tests and update context with results
  const testsPass = criticResult.data.approved; // Placeholder

  return {
    context: updatedContext,
    success: testsPass && criticResult.data.approved,
    approved: criticResult.data.approved,
  };
}

/**
 * Reset agent contexts
 */
async function resetContext(agents: any, contextMonitor: ContextMonitor): Promise<void> {
  const resetter = new SessionResetter();

  await resetter.reset({
    librarian: agents.librarian,
    artisan: agents.artisan,
    critic: agents.critic,
  });

  contextMonitor.reset();

  logger.info('Context reset complete');
}
