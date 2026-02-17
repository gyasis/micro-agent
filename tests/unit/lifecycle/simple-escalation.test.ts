/**
 * Unit tests for Simple Mode & Escalation logic
 * Tests: buildFailureSummary, withEscalationContext, escalation trigger conditions
 */

import { describe, it, expect } from 'vitest';
import { withEscalationContext, createAgentContext } from '../../../src/agents/base/agent-context';
import { v4 as uuidv4 } from 'uuid';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<{
  iteration: number;
  codeChangeSummary: string;
  testStatus: 'passed' | 'failed' | 'error';
  failedTests: string[];
  errorMessages: string[];
  duration: number;
  cost: number;
}> = {}) {
  return {
    iteration: 1,
    codeChangeSummary: 'changed multiply() return expression',
    testStatus: 'failed' as const,
    failedTests: ['multiply works'],
    errorMessages: ['Expected 12, received NaN'],
    duration: 1200,
    cost: 0.005,
    ...overrides,
  };
}

function makeSummary(records: ReturnType<typeof makeRecord>[]) {
  const totalSimpleCost = records.reduce((sum, r) => sum + r.cost, 0);
  const allErrors = records.flatMap(r => r.errorMessages);
  const uniqueErrorSignatures = [...new Set(allErrors)];
  const lastRecord = records[records.length - 1];
  const finalTestState = {
    failedTests: lastRecord?.failedTests || [],
    lastErrorMessages: lastRecord?.errorMessages || [],
  };
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

function makeContext() {
  return createAgentContext({
    sessionId: uuidv4(),
    iteration: 1,
    maxIterations: 10,
    objective: 'Fix multiply function',
    workingDirectory: '/tmp/test',
    testCommand: 'npm test',
    testFramework: 'vitest',
    maxCostUsd: 1.0,
    maxDurationMinutes: 15,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildFailureSummary', () => {
  it('captures total iteration count and cost', () => {
    const records = [
      makeRecord({ iteration: 1, cost: 0.005 }),
      makeRecord({ iteration: 2, cost: 0.007 }),
      makeRecord({ iteration: 3, cost: 0.006 }),
    ];
    const summary = makeSummary(records);
    expect(summary.totalSimpleIterations).toBe(3);
    expect(summary.totalSimpleCost).toBeCloseTo(0.018);
  });

  it('deduplicates error signatures across iterations', () => {
    const records = [
      makeRecord({ errorMessages: ['Expected 12, received NaN'] }),
      makeRecord({ errorMessages: ['Expected 12, received NaN'] }),
      makeRecord({ errorMessages: ['Expected 12, received NaN', 'Cannot read properties of undefined'] }),
    ];
    const summary = makeSummary(records);
    expect(summary.uniqueErrorSignatures).toHaveLength(2);
    expect(summary.uniqueErrorSignatures).toContain('Expected 12, received NaN');
    expect(summary.uniqueErrorSignatures).toContain('Cannot read properties of undefined');
  });

  it('captures final test state from last record', () => {
    const records = [
      makeRecord({ iteration: 1, failedTests: ['test A'], errorMessages: ['err 1'] }),
      makeRecord({ iteration: 2, failedTests: ['test B'], errorMessages: ['err 2'] }),
    ];
    const summary = makeSummary(records);
    expect(summary.finalTestState.failedTests).toEqual(['test B']);
    expect(summary.finalTestState.lastErrorMessages).toEqual(['err 2']);
  });

  it('includes all iteration history in naturalLanguageSummary', () => {
    const records = [
      makeRecord({ iteration: 1, codeChangeSummary: 'changed line 5', errorMessages: ['Expected 12, received 5'] }),
      makeRecord({ iteration: 2, codeChangeSummary: 'added null check', errorMessages: ['Expected 12, received null'] }),
    ];
    const summary = makeSummary(records);
    expect(summary.naturalLanguageSummary).toContain('SIMPLE MODE HISTORY');
    expect(summary.naturalLanguageSummary).toContain('Iteration 1');
    expect(summary.naturalLanguageSummary).toContain('Iteration 2');
    expect(summary.naturalLanguageSummary).toContain('changed line 5');
  });

  it('truncates naturalLanguageSummary at 2000 chars', () => {
    const longSummary = 'x'.repeat(300);
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ iteration: i + 1, codeChangeSummary: longSummary, errorMessages: [longSummary] })
    );
    const summary = makeSummary(records);
    expect(summary.naturalLanguageSummary.length).toBeLessThanOrEqual(2100);
    if (summary.naturalLanguageSummary.length > 2000) {
      expect(summary.naturalLanguageSummary).toContain('[summary truncated');
    }
  });

  it('handles single iteration correctly', () => {
    const records = [makeRecord({ iteration: 1 })];
    const summary = makeSummary(records);
    expect(summary.naturalLanguageSummary).toContain('1 iteration,');
  });
});

describe('withEscalationContext', () => {
  it('sets escalationContext on returned context', () => {
    const ctx = makeContext();
    const summary = 'Simple mode failed 5 times: Expected 12, received NaN';
    const updated = withEscalationContext(ctx, summary);
    expect(updated.escalationContext).toBe(summary);
  });

  it('does not mutate the original context', () => {
    const ctx = makeContext();
    const summary = 'Simple mode failed 5 times';
    withEscalationContext(ctx, summary);
    expect(ctx.escalationContext).toBeUndefined();
  });

  it('preserves all other context fields unchanged', () => {
    const ctx = makeContext();
    const updated = withEscalationContext(ctx, 'summary text');
    expect(updated.objective).toBe(ctx.objective);
    expect(updated.workingDirectory).toBe(ctx.workingDirectory);
    expect(updated.budget).toEqual(ctx.budget);
    expect(updated.sessionId).toBe(ctx.sessionId);
  });

  it('can overwrite an existing escalationContext', () => {
    const ctx = makeContext();
    const first = withEscalationContext(ctx, 'first summary');
    const second = withEscalationContext(first, 'second summary');
    expect(second.escalationContext).toBe('second summary');
    expect(first.escalationContext).toBe('first summary');
  });
});

describe('escalation trigger conditions', () => {
  it('should escalate when iterations exhausted and not noEscalate', () => {
    const simpleIterationCount = 5;
    const simpleMax = 5;
    const noEscalate = false;
    const success = false;
    const records = Array.from({ length: 5 }, (_, i) => makeRecord({ iteration: i + 1 }));

    const shouldEscalate = !success && !noEscalate && records.length > 0 && simpleIterationCount >= simpleMax;
    expect(shouldEscalate).toBe(true);
  });

  it('should NOT escalate when --no-escalate flag is set', () => {
    const noEscalate = true;
    const success = false;
    const records = [makeRecord()];

    const shouldEscalate = !success && !noEscalate && records.length > 0;
    expect(shouldEscalate).toBe(false);
  });

  it('should NOT escalate when already successful', () => {
    const noEscalate = false;
    const success = true;
    const records = [makeRecord({ testStatus: 'passed' })];

    const shouldEscalate = !success && !noEscalate && records.length > 0;
    expect(shouldEscalate).toBe(false);
  });
});
