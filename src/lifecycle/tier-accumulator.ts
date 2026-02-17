/**
 * Tier Failure Accumulator
 * @module lifecycle/tier-accumulator
 */

import { withEscalationContext } from '../agents/base/agent-context';
import type { AgentContext } from '../agents/base/agent-context';
import type { TierRunResult, AccumulatedFailureSummary } from './types';

const MAX_SUMMARY_CHARS = 4000;
const TRUNCATION_MARKER = '\n[prior tier history truncated for context efficiency]';

export function buildAccumulatedSummary(
  priorResults: TierRunResult[],
): AccumulatedFailureSummary {
  if (priorResults.length === 0) {
    return {
      naturalLanguageSummary: '',
      totalIterationsAcrossTiers: 0,
      totalCostUsdAcrossTiers: 0,
      allUniqueErrorSignatures: [],
      lastFailedTests: [],
    };
  }

  const totalIterations = priorResults.reduce((s, r) => s + r.iterationsRan, 0);
  const totalCost = priorResults.reduce((s, r) => s + r.totalCostUsd, 0);

  const allErrors = priorResults.flatMap(r =>
    r.records.flatMap(rec => rec.errorMessages)
  );
  const allUniqueErrorSignatures = [...new Set(allErrors)];

  const lastTierRecords = priorResults[priorResults.length - 1].records;
  const lastRecord = lastTierRecords[lastTierRecords.length - 1];
  const lastFailedTests = lastRecord?.failedTests ?? [];

  const blocks: string[] = priorResults.map((result, idx) =>
    buildTierBlock(result, idx + 1)
  );

  const footer = `\n[total accumulated across ${priorResults.length} tier(s): ${totalIterations} iterations, $${totalCost.toFixed(4)}]`;

  let summary = blocks.join('\n') + footer;

  if (summary.length > MAX_SUMMARY_CHARS) {
    let truncated = footer + TRUNCATION_MARKER;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const candidate = blocks.slice(i).join('\n') + footer;
      if (candidate.length <= MAX_SUMMARY_CHARS) {
        truncated = candidate;
        break;
      }
    }
    if (truncated === footer + TRUNCATION_MARKER) {
      const hardCap = MAX_SUMMARY_CHARS - TRUNCATION_MARKER.length;
      truncated = blocks[blocks.length - 1].slice(0, hardCap) + TRUNCATION_MARKER;
    }
    summary = truncated;
  }

  return {
    naturalLanguageSummary: summary,
    totalIterationsAcrossTiers: totalIterations,
    totalCostUsdAcrossTiers: totalCost,
    allUniqueErrorSignatures,
    lastFailedTests,
  };
}

function buildTierBlock(result: TierRunResult, displayIndex: number): string {
  const header = `=== TIER ${displayIndex} FAILURES: ${result.tierName} (${result.iterationsRan} iteration${result.iterationsRan !== 1 ? 's' : ''}) ===`;
  const lines: string[] = [header, ''];

  for (const rec of result.records) {
    const errSummary = rec.errorMessages.slice(0, 2).join('; ') || 'no error captured';
    lines.push(
      `Iteration ${rec.iteration}: ${rec.codeChangeSummary || 'code modified'}. Tests: ${errSummary}`
    );
  }

  const tierErrors = [...new Set(result.records.flatMap(r => r.errorMessages))];
  lines.push('');
  lines.push(`Unique error patterns: ${tierErrors.slice(0, 5).join(' | ') || 'none'}`);

  return lines.join('\n');
}

export function withTierEscalationContext(
  context: AgentContext,
  summary: AccumulatedFailureSummary,
): AgentContext {
  if (!summary.naturalLanguageSummary) return context;
  return withEscalationContext(context, summary.naturalLanguageSummary);
}
