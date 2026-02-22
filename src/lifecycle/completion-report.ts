/**
 * Detailed Completion Report (T056)
 *
 * Generates comprehensive report at end of Ralph Loop execution:
 * - Iteration breakdown
 * - Cost analysis (per agent, per iteration)
 * - Test results summary
 * - Patterns learned (from MemoryVault)
 * - Time analysis
 * - Success/failure metrics
 *
 * @module lifecycle/completion-report
 */

import type { RalphTestResult } from '../parsers/base-parser';
import type { BudgetStatus } from './iteration-manager';
import type { CompletionStatusResult } from './completion-status';
import {
  formatCompletionStatus,
  getRecommendedNextSteps,
} from './completion-status';
import { formatBudgetStatus } from './budget-enforcer';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Iteration summary for reporting
 */
export interface IterationSummary {
  iteration: number;
  duration: number;
  cost: number;
  testsPassed: boolean;
  testsTotal: number;
  testsFailed: number;
  state: string;
}

/**
 * Cost breakdown by component
 */
export interface CostBreakdown {
  librarian: number;
  artisan: number;
  critic: number;
  chaos: number;
  total: number;
}

/**
 * Patterns learned during session
 */
export interface LearnedPattern {
  errorCategory: string;
  solution: string;
  occurrences: number;
  successRate: number;
}

/**
 * Complete completion report
 */
export interface CompletionReport {
  sessionId: string;
  status: CompletionStatusResult;
  iterations: IterationSummary[];
  budget: {
    totalCost: number;
    costBreakdown: CostBreakdown;
    totalDuration: number;
    averageDurationPerIteration: number;
  };
  testing: {
    finalResults: RalphTestResult | null;
    totalTestsRun: number;
    totalTestsPassed: number;
    totalTestsFailed: number;
    coveragePercentage?: number;
  };
  patterns: LearnedPattern[];
  performance: {
    iterationsPerMinute: number;
    costPerIteration: number;
    successRate: number;
  };
  nextSteps: string[];
  timestamp: string;
}

/**
 * Generate detailed completion report (T056)
 */
export function generateCompletionReport(
  sessionId: string,
  status: CompletionStatusResult,
  iterations: IterationSummary[],
  budgetStatus: BudgetStatus,
  finalTestResults: RalphTestResult | null,
  patterns: LearnedPattern[] = [],
): CompletionReport {
  // Calculate cost breakdown (placeholder - actual implementation would track by agent)
  const costBreakdown: CostBreakdown = {
    librarian: budgetStatus.totalCost * 0.2, // Estimated 20%
    artisan: budgetStatus.totalCost * 0.5, // Estimated 50%
    critic: budgetStatus.totalCost * 0.2, // Estimated 20%
    chaos: budgetStatus.totalCost * 0.1, // Estimated 10%
    total: budgetStatus.totalCost,
  };

  // Calculate testing metrics
  const totalTestsRun = iterations.reduce(
    (sum, iter) => sum + iter.testsTotal,
    0,
  );
  const totalTestsPassed = iterations.filter((iter) => iter.testsPassed).length;
  const totalTestsFailed = iterations.length - totalTestsPassed;

  // Calculate performance metrics
  const totalDuration = budgetStatus.elapsedMinutes;
  const averageDurationPerIteration =
    iterations.length > 0 ? totalDuration / iterations.length : 0;
  const iterationsPerMinute =
    totalDuration > 0 ? iterations.length / totalDuration : 0;
  const costPerIteration =
    iterations.length > 0 ? budgetStatus.totalCost / iterations.length : 0;
  const successRate =
    iterations.length > 0 ? (totalTestsPassed / iterations.length) * 100 : 0;

  // Get recommended next steps
  const nextSteps = getRecommendedNextSteps(status);

  const report: CompletionReport = {
    sessionId,
    status,
    iterations,
    budget: {
      totalCost: budgetStatus.totalCost,
      costBreakdown,
      totalDuration,
      averageDurationPerIteration,
    },
    testing: {
      finalResults: finalTestResults,
      totalTestsRun,
      totalTestsPassed,
      totalTestsFailed,
      coveragePercentage: finalTestResults?.coverage?.lines?.percentage,
    },
    patterns,
    performance: {
      iterationsPerMinute,
      costPerIteration,
      successRate,
    },
    nextSteps,
    timestamp: new Date().toISOString(),
  };

  logger.info('Completion report generated', {
    sessionId,
    status: status.status,
    iterations: iterations.length,
    totalCost: budgetStatus.totalCost,
  });

  return report;
}

/**
 * Format completion report as human-readable text
 */
export function formatCompletionReport(report: CompletionReport): string {
  const lines: string[] = [];

  lines.push('═'.repeat(80));
  lines.push('Ralph Loop Session Complete');
  lines.push('═'.repeat(80));
  lines.push('');
  lines.push(`Session ID: ${report.sessionId}`);
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push('');

  // Completion Status
  lines.push(formatCompletionStatus(report.status));
  lines.push('');

  // Budget Summary
  lines.push('─'.repeat(80));
  lines.push('Budget Summary');
  lines.push('─'.repeat(80));
  lines.push(`Total Cost: $${report.budget.totalCost.toFixed(2)}`);
  lines.push('');
  lines.push('Cost Breakdown:');
  lines.push(
    `  Librarian: $${report.budget.costBreakdown.librarian.toFixed(2)}`,
  );
  lines.push(`  Artisan:   $${report.budget.costBreakdown.artisan.toFixed(2)}`);
  lines.push(`  Critic:    $${report.budget.costBreakdown.critic.toFixed(2)}`);
  lines.push(`  Chaos:     $${report.budget.costBreakdown.chaos.toFixed(2)}`);
  lines.push('');
  lines.push(
    `Total Duration: ${report.budget.totalDuration.toFixed(1)} minutes`,
  );
  lines.push(
    `Average Duration per Iteration: ${report.budget.averageDurationPerIteration.toFixed(1)} min`,
  );
  lines.push('');

  // Testing Summary
  lines.push('─'.repeat(80));
  lines.push('Testing Summary');
  lines.push('─'.repeat(80));

  if (report.testing.finalResults) {
    const results = report.testing.finalResults;
    lines.push(`Framework: ${results.framework}`);
    lines.push(
      `Final Test Results: ${results.summary.passed}/${results.summary.total} passed`,
    );
    lines.push(`  Passed:  ${results.summary.passed}`);
    lines.push(`  Failed:  ${results.summary.failed}`);
    lines.push(`  Skipped: ${results.summary.skipped}`);

    if (report.testing.coveragePercentage !== undefined) {
      lines.push(
        `  Coverage: ${report.testing.coveragePercentage.toFixed(1)}%`,
      );
    }
  } else {
    lines.push('No test results available');
  }

  lines.push('');
  lines.push(
    `Total Tests Run Across All Iterations: ${report.testing.totalTestsRun}`,
  );
  lines.push('');

  // Iteration Breakdown
  lines.push('─'.repeat(80));
  lines.push('Iteration Breakdown');
  lines.push('─'.repeat(80));
  lines.push('');

  for (const iter of report.iterations) {
    const icon = iter.testsPassed ? '✅' : '❌';
    lines.push(
      `${icon} Iteration ${iter.iteration}: ${iter.testsTotal - iter.testsFailed}/${iter.testsTotal} tests | ` +
        `$${iter.cost.toFixed(2)} | ${iter.duration.toFixed(1)}s | ${iter.state}`,
    );
  }

  lines.push('');

  // Performance Metrics
  lines.push('─'.repeat(80));
  lines.push('Performance Metrics');
  lines.push('─'.repeat(80));
  lines.push(
    `Iterations per Minute: ${report.performance.iterationsPerMinute.toFixed(2)}`,
  );
  lines.push(
    `Cost per Iteration: $${report.performance.costPerIteration.toFixed(2)}`,
  );
  lines.push(`Success Rate: ${report.performance.successRate.toFixed(1)}%`);
  lines.push('');

  // Patterns Learned
  if (report.patterns.length > 0) {
    lines.push('─'.repeat(80));
    lines.push('Patterns Learned');
    lines.push('─'.repeat(80));
    lines.push('');

    for (const pattern of report.patterns) {
      lines.push(`Category: ${pattern.errorCategory}`);
      lines.push(`  Solution: ${pattern.solution}`);
      lines.push(`  Occurrences: ${pattern.occurrences}`);
      lines.push(`  Success Rate: ${pattern.successRate.toFixed(1)}%`);
      lines.push('');
    }
  }

  // Next Steps
  lines.push('─'.repeat(80));
  lines.push('Recommended Next Steps');
  lines.push('─'.repeat(80));
  lines.push('');

  for (const step of report.nextSteps) {
    lines.push(`• ${step}`);
  }

  lines.push('');
  lines.push('═'.repeat(80));

  return lines.join('\n');
}

/**
 * Export completion report to JSON file
 */
export function exportCompletionReportJSON(report: CompletionReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Generate summary metrics for analytics
 */
export function generateSummaryMetrics(report: CompletionReport): {
  sessionId: string;
  status: string;
  success: boolean;
  iterations: number;
  totalCost: number;
  totalDuration: number;
  finalTestsPassed: number;
  finalTestsTotal: number;
  coveragePercentage?: number;
  patternsLearned: number;
  timestamp: string;
} {
  return {
    sessionId: report.sessionId,
    status: report.status.status,
    success: report.status.status === 'success',
    iterations: report.iterations.length,
    totalCost: report.budget.totalCost,
    totalDuration: report.budget.totalDuration,
    finalTestsPassed: report.testing.finalResults?.summary.passed || 0,
    finalTestsTotal: report.testing.finalResults?.summary.total || 0,
    coveragePercentage: report.testing.coveragePercentage,
    patternsLearned: report.patterns.length,
    timestamp: report.timestamp,
  };
}

/**
 * Create iteration summary from execution result
 */
export function createIterationSummary(
  iteration: number,
  duration: number,
  cost: number,
  testResults: RalphTestResult | null,
  state: string,
): IterationSummary {
  return {
    iteration,
    duration,
    cost,
    testsPassed: testResults?.summary.status === 'passed' || false,
    testsTotal: testResults?.summary.total || 0,
    testsFailed: testResults?.summary.failed || 0,
    state,
  };
}
