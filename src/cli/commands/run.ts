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
  withTestResults,
  isBudgetExceeded,
  withEscalationContext,
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
  simpleIterations?: string;  // --simple N (default "5")
  noEscalate?: boolean;       // --no-escalate flag
  fullMode?: boolean;         // --full flag
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

    // Register agents with context monitor for token tracking
    contextMonitor.registerAgent('librarian', agents.librarian.getConfig().model);
    contextMonitor.registerAgent('artisan', agents.artisan.getConfig().model);
    contextMonitor.registerAgent('critic', agents.critic.getConfig().model);

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

    // Step 6: Simple mode loop (Artisan + Tests only)
    let success = false;
    let iteration = 0;
    const simpleMax = params.simpleIterations;
    const useFullMode = params.fullMode;
    const noEscalate = params.noEscalate;

    // Accumulate simple mode failure records for escalation handoff
    const simpleRecords: Array<{
      iteration: number;
      codeChangeSummary: string;
      testStatus: 'passed' | 'failed' | 'error';
      failedTests: string[];
      errorMessages: string[];
      duration: number;
      cost: number;
    }> = [];

    let simpleCost = 0;
    let fullCost = 0;
    let simpleIterationCount = 0;
    let fullIterationCount = 0;
    const fullErrorMessages: string[] = [];

    // ── Phase A: Simple mode (skip if --full) ──────────────────────────────
    if (!useFullMode) {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Simple Mode: up to ${simpleMax} iteration(s)`);
      logger.info('='.repeat(60));

      while (simpleIterationCount < simpleMax && !success) {
        simpleIterationCount++;
        iteration++;
        context.iteration.iteration = iteration;

        logger.info(`\n[Simple ${simpleIterationCount}/${simpleMax}]`);

        try {
          if (isBudgetExceeded(context)) {
            logger.warn('Budget exceeded during simple mode, stopping');
            break;
          }

          const iterStart = Date.now();
          const prevCost = context.budget.currentCostUsd;

          const result = await runSimpleIteration(context, agents, contextMonitor);
          context = result.context;
          success = result.success;

          const iterCost = context.budget.currentCostUsd - prevCost;
          simpleCost += iterCost;

          // Get failure info from last test result
          const lastResult = context.test.lastResult;
          const failedTests = lastResult?.failures.map(f => f.testName) || [];
          const errorMessages = lastResult?.failures.map(f => f.errorMessage).filter((v, i, a) => a.indexOf(v) === i) || [];
          const artisanReasoning = context.artisanCode?.reasoning || 'code modified';

          simpleRecords.push({
            iteration: simpleIterationCount,
            codeChangeSummary: artisanReasoning.slice(0, 200),
            testStatus: success ? 'passed' : 'failed',
            failedTests,
            errorMessages,
            duration: Date.now() - iterStart,
            cost: iterCost,
          });

          if (success) {
            logger.info(`Simple Mode: Solved in ${simpleIterationCount}/${simpleMax} iterations`);
            break;
          }

          // Context reset every iteration (Ralph Loop gold standard)
          if (iterationManager.shouldResetContext()) {
            await resetContext(agents, contextMonitor, context.sessionId, iteration);
          }
        } catch (error) {
          logger.error(`Simple mode iteration ${simpleIterationCount} error`, error);
          const errorSignature = String(error);
          const shouldStop = iterationManager.trackError(errorSignature);
          if (shouldStop) {
            logger.error('Circuit breaker triggered in simple mode');
            break;
          }
        }
      }
    }

    // ── Phase B: Escalation ────────────────────────────────────────────────
    if (!success && !noEscalate && !useFullMode && simpleRecords.length > 0 && !isBudgetExceeded(context)) {
      const summary = buildFailureSummary(simpleRecords);
      context = withEscalationContext(context, summary.naturalLanguageSummary);

      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Escalating to Full Mode after ${simpleIterationCount} simple iteration(s)`);
      logger.info(`   Summary: ${summary.naturalLanguageSummary.slice(0, 200)}...`);
      logger.info(`   Remaining budget: $${(context.budget.maxCostUsd - context.budget.currentCostUsd).toFixed(3)}`);
      logger.info('='.repeat(60));
    }

    // ── Phase C: Full mode loop ────────────────────────────────────────────
    const shouldRunFullMode = useFullMode || (!success && !noEscalate && !isBudgetExceeded(context));
    const remainingIterations = params.maxIterations - simpleIterationCount;

    if (shouldRunFullMode && remainingIterations > 0) {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Full Mode: up to ${remainingIterations} iteration(s) remaining`);
      logger.info('='.repeat(60));

      while (fullIterationCount < remainingIterations && !success) {
        fullIterationCount++;
        iteration++;
        context.iteration.iteration = iteration;

        logger.info(`\n[Full ${fullIterationCount}/${remainingIterations}]`);

        try {
          if (isBudgetExceeded(context)) {
            logger.warn('Budget exceeded during full mode, stopping');
            break;
          }

          const prevCost = context.budget.currentCostUsd;

          const result = await runSingleIteration(context, agents, iterationManager, contextMonitor);
          context = result.context;
          success = result.success;

          fullCost += context.budget.currentCostUsd - prevCost;

          // Capture full mode errors for failure report
          if (!success) {
            const lastResult = context.test.lastResult;
            const errs = lastResult?.failures.map(f => f.errorMessage) || [];
            for (const e of errs) {
              if (!fullErrorMessages.includes(e)) fullErrorMessages.push(e);
            }
          }

          if (iterationManager.shouldResetContext()) {
            await resetContext(agents, contextMonitor, context.sessionId, iteration);
          }

          logger.info(`Full Mode iteration ${fullIterationCount} ${success ? 'SUCCESS' : 'FAILED'}`, {
            cost: context.budget.currentCostUsd.toFixed(3),
          });

          if (success) {
            logger.info('Objective achieved!');
            break;
          }
        } catch (error) {
          logger.error(`Full mode iteration ${fullIterationCount} error`, error);
          const errorSignature = String(error);
          const shouldStop = iterationManager.trackError(errorSignature);
          if (shouldStop) {
            logger.error('Circuit breaker triggered in full mode');
            break;
          }
        }
      }
    }

    // Step 7: Final report
    const duration = (Date.now() - startTime) / 1000;
    const escalated = simpleIterationCount > 0 && fullIterationCount > 0;
    const modeLabel = useFullMode
      ? 'Full only'
      : success && simpleIterationCount > 0 && fullIterationCount === 0
        ? 'Simple only'
        : escalated && success
          ? 'Simple -> Full (escalated)'
          : escalated && !success
            ? 'Simple -> Full (escalated, also failed)'
            : 'Full only';

    logger.info('\n' + '='.repeat(60));
    if (success) {
      logger.info(fullIterationCount > 0
        ? `Full Mode: Solved in ${fullIterationCount} additional iteration(s)`
        : `Simple Mode: Solved in ${simpleIterationCount}/${params.simpleIterations} iterations`);
    } else {
      logger.info(escalated ? 'Both modes exhausted without success' : 'Micro Agent Complete');
    }
    logger.info('='.repeat(60));
    logger.info(`Status:     ${success ? 'SUCCESS' : 'FAILED'}`);
    logger.info(`Mode:       ${modeLabel}`);
    logger.info(`Iterations: ${simpleIterationCount} simple / ${fullIterationCount} full / ${simpleIterationCount + fullIterationCount} total`);
    logger.info(`Cost:       $${simpleCost.toFixed(3)} simple / $${fullCost.toFixed(3)} full / $${context.budget.currentCostUsd.toFixed(3)} total`);
    logger.info(`Duration:   ${duration.toFixed(1)}s`);

    // On full failure, show per-phase error summary
    if (!success) {
      const simpleErrors = [...new Set(simpleRecords.flatMap(r => r.errorMessages))].slice(0, 5);
      if (simpleErrors.length > 0) {
        logger.info('\nSimple mode errors:');
        for (const e of simpleErrors) logger.info(`  - "${e}"`);
      }
      if (fullErrorMessages.length > 0) {
        logger.info('\nFull mode errors:');
        for (const e of fullErrorMessages.slice(0, 5)) logger.info(`  - "${e}"`);
      }
    }

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
  simpleIterations: number;
  noEscalate: boolean;
  fullMode: boolean;
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
    simpleIterations: parseInt(options.simpleIterations || '5', 10),
    noEscalate: options.noEscalate || false,
    fullMode: options.fullMode || false,
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
 * Run a single simple mode iteration — Artisan + Tests only.
 * Skips Librarian (phase 1) and Critic (phase 3).
 */
async function runSimpleIteration(
  context: AgentContext,
  agents: any,
  contextMonitor: ContextMonitor
): Promise<{
  context: AgentContext;
  success: boolean;
}> {
  // Phase 2: Artisan - Code Generation (only phase in simple mode)
  logger.info('Simple Mode: Artisan generating code...');
  let updatedContext = updatePhase(context, 'generation');

  await agents.artisan.initialize(updatedContext);
  const artisanResult = await agents.artisan.execute();

  if (!artisanResult.success || !artisanResult.data) {
    throw new Error('Artisan failed to generate code');
  }

  updatedContext = withArtisanCode(updatedContext, artisanResult.data);
  contextMonitor.trackTokens('artisan', artisanResult.tokensUsed);

  // Phase 4: Testing - Run actual tests
  logger.info('Simple Mode: Running tests...');
  updatedContext = updatePhase(updatedContext, 'testing');

  const { createTestRunner } = await import('../../testing/test-runner');
  const testRunner = createTestRunner(logger);

  const testResult = await testRunner.runTests({
    workingDirectory: context.workingDirectory,
    testCommand: context.test.command,
    timeout: 120000,
  });

  updatedContext = withTestResults(updatedContext, testResult.results);

  const testsPass = testResult.success && testResult.results.summary.status === 'passed';

  logger.info('Simple Mode: Tests completed', {
    status: testResult.results.summary.status,
    passed: testResult.results.summary.passed,
    failed: testResult.results.summary.failed,
  });

  return {
    context: updatedContext,
    success: testsPass,
  };
}

/**
 * Build a structured failure summary from simple mode iteration records.
 * The naturalLanguageSummary is injected into the Librarian prompt on escalation.
 */
function buildFailureSummary(records: Array<{
  iteration: number;
  codeChangeSummary: string;
  testStatus: 'passed' | 'failed' | 'error';
  failedTests: string[];
  errorMessages: string[];
  duration: number;
  cost: number;
}>): {
  totalSimpleIterations: number;
  totalSimpleCost: number;
  uniqueErrorSignatures: string[];
  finalTestState: { failedTests: string[]; lastErrorMessages: string[] };
  naturalLanguageSummary: string;
} {
  const totalSimpleCost = records.reduce((sum, r) => sum + r.cost, 0);

  // Deduplicate error signatures
  const allErrors = records.flatMap(r => r.errorMessages);
  const uniqueErrorSignatures = [...new Set(allErrors)];

  // Last iteration state
  const lastRecord = records[records.length - 1];
  const finalTestState = {
    failedTests: lastRecord?.failedTests || [],
    lastErrorMessages: lastRecord?.errorMessages || [],
  };

  // Build natural language summary (capped for token efficiency)
  const lines: string[] = [
    `SIMPLE MODE HISTORY (${records.length} iteration${records.length !== 1 ? 's' : ''}, all failed):`,
    '',
  ];

  for (const r of records) {
    const errSummary = r.errorMessages.slice(0, 2).join('; ') || 'no error captured';
    lines.push(`Iteration ${r.iteration}: ${r.codeChangeSummary || 'code modified'}. Tests: ${errSummary}`);
  }

  lines.push('');
  lines.push(`Unique error patterns: ${uniqueErrorSignatures.slice(0, 5).join(' | ') || 'none'}`);

  // Cap at ~500 tokens (roughly 2000 chars)
  const rawSummary = lines.join('\n');
  const naturalLanguageSummary = rawSummary.length > 2000
    ? rawSummary.slice(0, 1950) + '\n[summary truncated for context efficiency]'
    : rawSummary;

  return {
    totalSimpleIterations: records.length,
    totalSimpleCost,
    uniqueErrorSignatures,
    finalTestState,
    naturalLanguageSummary,
  };
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

  // Phase 4: Testing - Run actual tests
  logger.info('Phase 4: Running tests...');
  updatedContext = updatePhase(updatedContext, 'testing');

  // Run tests using test runner
  const { createTestRunner } = await import('../../testing/test-runner');
  const testRunner = createTestRunner(logger);

  const testResult = await testRunner.runTests({
    workingDirectory: context.workingDirectory,
    testCommand: context.test.command,
    timeout: 120000, // 2 minutes
  });

  // Update context with test results (T091)
  updatedContext = withTestResults(updatedContext, testResult.results);

  const testsPass = testResult.success && testResult.results.summary.status === 'passed';

  logger.info('Tests completed', {
    status: testResult.results.summary.status,
    passed: testResult.results.summary.passed,
    failed: testResult.results.summary.failed,
    total: testResult.results.summary.total,
  });

  return {
    context: updatedContext,
    success: testsPass && criticResult.data.approved,
    approved: criticResult.data.approved,
  };
}

/**
 * Reset agent contexts
 */
async function resetContext(agents: any, contextMonitor: ContextMonitor, sessionId: string, iteration: number): Promise<void> {
  const resetter = new SessionResetter({ sessionId, verbose: false });

  // Register agent cleanup hooks so resetter actually wipes agent state
  resetter.registerAgentCleanup('librarian', () => agents.librarian.cleanup());
  resetter.registerAgentCleanup('artisan', () => agents.artisan.cleanup());
  resetter.registerAgentCleanup('critic', () => agents.critic.cleanup());

  await resetter.reset(iteration);

  contextMonitor.reset();

  logger.info('Context reset complete');
}
