/**
 * Tier Engine — runs a single tier's iteration loop
 * @module lifecycle/tier-engine
 */

import { createLogger } from '../utils/logger';
import { isBudgetExceeded } from '../agents/base/agent-context';
import type { AgentContext } from '../agents/base/agent-context';
import type { TierConfig, TierAttemptRecord, TierRunResult } from './types';
import type { AuditDatabase } from './tier-db';
import { writeAttemptRecord } from './tier-db';

const logger = createLogger();

export interface TierEngineContext {
  runId: string;
  tierConfig: TierConfig;
  tierIndex: number;
  context: AgentContext;
  agents: any;
  testRunner: any;
  db: AuditDatabase | null;
}

/**
 * Run a single tier's iteration loop.
 * Calls runSimpleIteration up to tier.maxIterations times.
 * Records each attempt, checks budget, returns TierRunResult.
 */
export async function runTier(
  tierCtx: TierEngineContext,
  runSimpleIteration: (ctx: AgentContext, agents: any, testRunner: any) => Promise<{ context: AgentContext; success: boolean }>,
): Promise<{ result: TierRunResult; finalContext: AgentContext }> {
  const { runId, tierConfig, tierIndex, db } = tierCtx;
  let context = tierCtx.context;

  const records: TierAttemptRecord[] = [];
  let success = false;
  let exitReason: TierRunResult['exitReason'] = 'iterations_exhausted';
  let totalCostUsd = 0;

  logger.info(`[tier-engine] Starting tier ${tierIndex + 1}: "${tierConfig.name}" (mode=${tierConfig.mode}, maxIter=${tierConfig.maxIterations})`);

  for (let iteration = 1; iteration <= tierConfig.maxIterations; iteration++) {
    if (isBudgetExceeded(context)) {
      logger.warn(`[tier-engine] Budget exceeded before iteration ${iteration} of tier "${tierConfig.name}"`);
      exitReason = 'budget_exhausted';
      break;
    }

    const iterStart = Date.now();

    let iterResult: { context: AgentContext; success: boolean };
    try {
      iterResult = await runSimpleIteration(context, tierCtx.agents, tierCtx.testRunner);
    } catch (err: any) {
      logger.error(`[tier-engine] Provider error on tier "${tierConfig.name}" iter ${iteration}: ${err.message}`);
      exitReason = 'provider_error';
      break;
    }

    context = iterResult.context;
    const durationMs = Date.now() - iterStart;
    const budget = (context as any).budget;
    totalCostUsd = budget?.totalCostUsd ?? 0;

    const testResults = (context as any).testResults;
    const testStatus: TierAttemptRecord['testStatus'] = iterResult.success
      ? 'passed'
      : (testResults?.status === 'error' ? 'error' : 'failed');
    const failedTests: string[] = testResults?.failures?.map((f: any) => f.testName) ?? [];
    const errorMessages: string[] = testResults?.failures?.map((f: any) => f.errorMessage).filter(Boolean) ?? [];

    const record: TierAttemptRecord = {
      runId,
      tierIndex,
      tierName: tierConfig.name,
      tierMode: tierConfig.mode,
      modelArtisan: tierConfig.models.artisan,
      modelLibrarian: tierConfig.models.librarian ?? null,
      modelCritic: tierConfig.models.critic ?? null,
      iteration,
      codeChangeSummary: (context as any).lastCodeChange ?? '',
      testStatus,
      failedTests,
      errorMessages,
      costUsd: totalCostUsd,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    records.push(record);

    if (db) {
      writeAttemptRecord(db, record);
    }

    if (iterResult.success) {
      success = true;
      exitReason = 'success';
      logger.info(`[tier-engine] Tier "${tierConfig.name}" succeeded on iteration ${iteration}`);
      break;
    }

    if (isBudgetExceeded(context)) {
      exitReason = 'budget_exhausted';
      break;
    }
  }

  const result: TierRunResult = {
    tierName: tierConfig.name,
    tierIndex,
    success,
    iterationsRan: records.length,
    totalCostUsd,
    records,
    exitReason,
  };

  return { result, finalContext: context };
}
