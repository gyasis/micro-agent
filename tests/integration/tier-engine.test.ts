/**
 * Integration test: 2-tier escalation flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { runTier } from '../../src/lifecycle/tier-engine';
import { buildAccumulatedSummary, withTierEscalationContext } from '../../src/lifecycle/tier-accumulator';
import { openAuditDatabase, closeAuditDatabase } from '../../src/lifecycle/tier-db';
import type { TierConfig } from '../../src/lifecycle/types';
import type { AgentContext } from '../../src/agents/base/agent-context';

const TMP_DIR = '/tmp/tier-engine-integration';

beforeEach(() => mkdirSync(TMP_DIR, { recursive: true }));
afterEach(() => rmSync(TMP_DIR, { recursive: true, force: true }));

function makeMinimalContext(overrides: Record<string, any> = {}): AgentContext {
  return {
    sessionId: 'sess-1',
    iteration: 1,
    objective: 'fix tests',
    targetFile: 'src/foo.ts',
    testCommand: 'npm test',
    language: 'typescript',
    testFramework: 'vitest',
    budget: {
      maxCostUsd: 5.0,
      currentCostUsd: 0,
      maxIterations: 20,
      maxDurationMinutes: 60,
      startTime: new Date(),
    },
    testResults: null,
    codeHistory: [],
    agentOutputs: [],
    escalationContext: null,
    ...overrides,
  } as any;
}

function makeTierConfig(overrides: Partial<TierConfig> = {}): TierConfig {
  return {
    name: 'local',
    mode: 'simple',
    maxIterations: 3,
    models: { artisan: 'llama3' },
    ...overrides,
  };
}

describe('2-tier escalation flow integration', () => {
  it('tier 1 fails, tier 2 succeeds with accumulated context', async () => {
    const db = openAuditDatabase(join(TMP_DIR, 'audit.db'));

    let tier1CallCount = 0;
    const failingRunner = vi.fn(async (ctx: AgentContext) => {
      tier1CallCount++;
      return {
        context: {
          ...ctx,
          testResults: {
            status: 'fail',
            totalTests: 1, passedTests: 0, failedTests: 1, skippedTests: 0,
            duration: 100,
            failures: [{ testName: 'test_foo', errorType: 'AssertionError', errorMessage: 'expected 1 to be 2', stackTrace: '' }],
          },
        },
        success: false,
      };
    });

    const tier1Config = makeTierConfig({ name: 'local-free', maxIterations: 2 });
    const ctx1 = makeMinimalContext();

    const { result: tier1Result, finalContext: finalCtx1 } = await runTier(
      { runId: 'run-1', tierConfig: tier1Config, tierIndex: 0, totalTiers: 2, context: ctx1, agents: {}, testRunner: {}, db },
      failingRunner,
    );

    expect(tier1Result.success).toBe(false);
    expect(tier1Result.iterationsRan).toBe(2);
    expect(tier1Result.exitReason).toBe('iterations_exhausted');
    expect(tier1CallCount).toBe(2);

    const summary = buildAccumulatedSummary([tier1Result]);
    expect(summary.naturalLanguageSummary).toContain('TIER 1 FAILURES: local-free');
    expect(summary.totalIterationsAcrossTiers).toBe(2);

    const ctx2 = withTierEscalationContext(finalCtx1, summary);

    const successRunner = vi.fn(async (ctx: AgentContext) => ({
      context: {
        ...ctx,
        testResults: { status: 'pass', totalTests: 1, passedTests: 1, failedTests: 0, skippedTests: 0, duration: 50, failures: [] },
      },
      success: true,
    }));

    const tier2Config = makeTierConfig({ name: 'cloud-haiku', maxIterations: 5 });

    const { result: tier2Result } = await runTier(
      { runId: 'run-1', tierConfig: tier2Config, tierIndex: 1, totalTiers: 2, context: ctx2, agents: {}, testRunner: {}, db },
      successRunner,
    );

    expect(tier2Result.success).toBe(true);
    expect(tier2Result.iterationsRan).toBe(1);
    expect(tier2Result.exitReason).toBe('success');

    closeAuditDatabase(db);
  });

  it('budget exhaustion stops tier before first iteration', async () => {
    const budgetExhaustedCtx = makeMinimalContext({
      budget: {
        maxCostUsd: 0.001,
        currentCostUsd: 999.0, // already exceeded
        maxIterations: 20,
        maxDurationMinutes: 60,
        startTime: new Date(),
      },
    });

    const neverCalledRunner = vi.fn(async () => ({ context: budgetExhaustedCtx, success: false }));

    const { result } = await runTier(
      { runId: 'run-2', tierConfig: makeTierConfig(), tierIndex: 0, totalTiers: 1, context: budgetExhaustedCtx, agents: {}, testRunner: {}, db: null },
      neverCalledRunner,
    );

    expect(result.exitReason).toBe('budget_exhausted');
    expect(result.iterationsRan).toBe(0);
    expect(neverCalledRunner).not.toHaveBeenCalled();
  });
});
