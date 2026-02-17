import { describe, it, expect } from 'vitest';
import { buildAccumulatedSummary } from '../../../src/lifecycle/tier-accumulator';
import type { TierRunResult, TierAttemptRecord } from '../../../src/lifecycle/types';

function makeRecord(overrides: Partial<TierAttemptRecord> = {}): TierAttemptRecord {
  return {
    runId: 'run-1',
    tierIndex: 0,
    tierName: 'local',
    tierMode: 'simple',
    modelArtisan: 'llama3',
    modelLibrarian: null,
    modelCritic: null,
    iteration: 1,
    codeChangeSummary: 'fixed import',
    testStatus: 'failed',
    failedTests: ['test_foo'],
    errorMessages: ['AssertionError: expected 1 to be 2'],
    costUsd: 0.0,
    durationMs: 1000,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeResult(overrides: Partial<TierRunResult> = {}): TierRunResult {
  return {
    tierName: 'local',
    tierIndex: 0,
    success: false,
    iterationsRan: 1,
    totalCostUsd: 0.0,
    records: [makeRecord()],
    exitReason: 'iterations_exhausted',
    ...overrides,
  };
}

describe('buildAccumulatedSummary', () => {
  it('returns empty summary for no prior results', () => {
    const summary = buildAccumulatedSummary([]);
    expect(summary.naturalLanguageSummary).toBe('');
    expect(summary.totalIterationsAcrossTiers).toBe(0);
    expect(summary.totalCostUsdAcrossTiers).toBe(0);
    expect(summary.allUniqueErrorSignatures).toEqual([]);
    expect(summary.lastFailedTests).toEqual([]);
  });

  it('includes tier header in summary', () => {
    const result = makeResult({ tierName: 'local-free', iterationsRan: 3 });
    const summary = buildAccumulatedSummary([result]);
    expect(summary.naturalLanguageSummary).toContain('=== TIER 1 FAILURES: local-free');
  });

  it('accumulates iterations across multiple tiers', () => {
    const r1 = makeResult({ tierIndex: 0, iterationsRan: 3 });
    const r2 = makeResult({ tierIndex: 1, tierName: 'cloud', iterationsRan: 5 });
    const summary = buildAccumulatedSummary([r1, r2]);
    expect(summary.totalIterationsAcrossTiers).toBe(8);
  });

  it('deduplicates error signatures across tiers', () => {
    const r1 = makeResult({ records: [makeRecord({ errorMessages: ['Error A', 'Error B'] })] });
    const r2 = makeResult({ records: [makeRecord({ errorMessages: ['Error A', 'Error C'] })] });
    const summary = buildAccumulatedSummary([r1, r2]);
    expect(summary.allUniqueErrorSignatures).toContain('Error A');
    expect(summary.allUniqueErrorSignatures.filter(e => e === 'Error A')).toHaveLength(1);
  });

  it('caps summary at 4000 characters', () => {
    const bigRecords = Array.from({ length: 100 }, (_, i) =>
      makeRecord({ iteration: i + 1, errorMessages: ['x'.repeat(200)] })
    );
    const result = makeResult({ records: bigRecords, iterationsRan: 100 });
    const summary = buildAccumulatedSummary([result]);
    expect(summary.naturalLanguageSummary.length).toBeLessThanOrEqual(4000);
  });

  it('extracts lastFailedTests from most recent tier last record', () => {
    const r1 = makeResult({ records: [makeRecord({ failedTests: ['old_test'] })] });
    const r2 = makeResult({
      tierName: 'tier2',
      records: [makeRecord({ failedTests: ['new_test'] })],
    });
    const summary = buildAccumulatedSummary([r1, r2]);
    expect(summary.lastFailedTests).toContain('new_test');
  });
});
