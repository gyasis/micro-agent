/**
 * Completion Status Logic (T055)
 *
 * Determines final status of Ralph Loop execution:
 * - success: Tests passed, all criteria met
 * - budget_exceeded: Hit cost, iteration, or time limit
 * - entropy_detected: Circuit breaker triggered (same error 3+ times)
 * - max_iterations: Reached iteration limit without success
 * - error: Catastrophic failure
 *
 * @module lifecycle/completion-status
 */

import type { RalphTestResult } from '../parsers/base-parser';
import type { BudgetStatus } from './iteration-manager';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Completion status types
 */
export type CompletionStatus =
  | 'success'
  | 'budget_exceeded'
  | 'entropy_detected'
  | 'max_iterations'
  | 'error';

/**
 * Completion status result
 */
export interface CompletionStatusResult {
  status: CompletionStatus;
  reason: string;
  details: {
    iterations: number;
    testsPassed: boolean;
    entropyDetected?: boolean;
    budgetConstraint?: 'iterations' | 'cost' | 'duration';
    error?: string;
  };
  finalState: string;
}

/**
 * Determine completion status (T055)
 *
 * Priority order:
 * 1. Error (catastrophic failure)
 * 2. Success (tests passed)
 * 3. Entropy detected (circuit breaker)
 * 4. Budget exceeded (cost/time)
 * 5. Max iterations (no progress)
 */
export function determineCompletionStatus(
  finalState: string,
  testResults: RalphTestResult | null,
  budgetStatus: BudgetStatus,
  entropyDetected: boolean,
  error?: Error,
): CompletionStatusResult {
  const result: CompletionStatusResult = {
    status: 'error',
    reason: 'Unknown completion status',
    details: {
      iterations: budgetStatus.currentIteration,
      testsPassed: false,
    },
    finalState,
  };

  // 1. Check for catastrophic error
  if (error || finalState === 'error') {
    result.status = 'error';
    result.reason = error ? error.message : 'State machine entered error state';
    result.details.error = result.reason;
    logger.error('Completion status: Error', { reason: result.reason });
    return result;
  }

  // 2. Check for success (tests passed)
  if (
    testResults &&
    testResults.summary.status === 'passed' &&
    testResults.summary.failed === 0
  ) {
    result.status = 'success';
    result.reason = 'All tests passed successfully';
    result.details.testsPassed = true;
    logger.info('✅ Completion status: Success', {
      iterations: budgetStatus.currentIteration,
      passed: testResults.summary.passed,
      total: testResults.summary.total,
    });
    return result;
  }

  // 3. Check for entropy detection (circuit breaker)
  if (entropyDetected) {
    result.status = 'entropy_detected';
    result.reason =
      'Identical errors detected 3+ times (circuit breaker triggered)';
    result.details.entropyDetected = true;
    logger.warn('⚠️  Completion status: Entropy detected', {
      iterations: budgetStatus.currentIteration,
    });
    return result;
  }

  // 4. Check for budget constraints
  if (!budgetStatus.withinBudget) {
    result.status = 'budget_exceeded';

    // Determine which constraint was exceeded
    if (budgetStatus.reason?.includes('max_cost_usd')) {
      result.details.budgetConstraint = 'cost';
      result.reason = `Cost limit exceeded: ${budgetStatus.reason}`;
    } else if (budgetStatus.reason?.includes('max_duration_minutes')) {
      result.details.budgetConstraint = 'duration';
      result.reason = `Time limit exceeded: ${budgetStatus.reason}`;
    } else if (budgetStatus.reason?.includes('max_iterations')) {
      result.details.budgetConstraint = 'iterations';
      result.reason = `Iteration limit exceeded: ${budgetStatus.reason}`;
    } else {
      result.reason = `Budget constraint exceeded: ${budgetStatus.reason}`;
    }

    logger.warn('⚠️  Completion status: Budget exceeded', {
      constraint: result.details.budgetConstraint,
      reason: budgetStatus.reason,
    });
    return result;
  }

  // 5. Default: Max iterations (shouldn't reach here if budget check works)
  result.status = 'max_iterations';
  result.reason = 'Maximum iterations reached without success';
  logger.warn('⚠️  Completion status: Max iterations', {
    iterations: budgetStatus.currentIteration,
  });

  return result;
}

/**
 * Format completion status for display
 */
export function formatCompletionStatus(result: CompletionStatusResult): string {
  const lines: string[] = [];

  // Status header
  const statusIcon = getStatusIcon(result.status);
  lines.push(`${statusIcon} Completion Status: ${result.status.toUpperCase()}`);
  lines.push('');

  // Reason
  lines.push(`Reason: ${result.reason}`);
  lines.push('');

  // Details
  lines.push('Details:');
  lines.push(`  Iterations: ${result.details.iterations}`);
  lines.push(`  Tests Passed: ${result.details.testsPassed ? 'Yes' : 'No'}`);

  if (result.details.entropyDetected) {
    lines.push(`  Entropy Detected: Yes (circuit breaker triggered)`);
  }

  if (result.details.budgetConstraint) {
    lines.push(`  Budget Constraint: ${result.details.budgetConstraint}`);
  }

  if (result.details.error) {
    lines.push(`  Error: ${result.details.error}`);
  }

  lines.push(`  Final State: ${result.finalState}`);

  return lines.join('\n');
}

/**
 * Get icon for status
 */
function getStatusIcon(status: CompletionStatus): string {
  const icons: Record<CompletionStatus, string> = {
    success: '✅',
    budget_exceeded: '⏱️',
    entropy_detected: '🔁',
    max_iterations: '🔄',
    error: '❌',
  };

  return icons[status] || '❓';
}

/**
 * Determine if status represents a successful completion
 */
export function isSuccessStatus(status: CompletionStatus): boolean {
  return status === 'success';
}

/**
 * Determine if status represents a failure
 */
export function isFailureStatus(status: CompletionStatus): boolean {
  return status === 'error';
}

/**
 * Determine if status represents a budget/resource constraint
 */
export function isBudgetConstraintStatus(status: CompletionStatus): boolean {
  return status === 'budget_exceeded' || status === 'max_iterations';
}

/**
 * Determine if status represents an entropy/stuck condition
 */
export function isEntropyStatus(status: CompletionStatus): boolean {
  return status === 'entropy_detected';
}

/**
 * Get recommended next steps based on status
 */
export function getRecommendedNextSteps(
  result: CompletionStatusResult,
): string[] {
  const steps: string[] = [];

  switch (result.status) {
    case 'success':
      steps.push('✅ Code is ready!');
      steps.push('Review generated code and commit changes');
      steps.push('Run full test suite to verify');
      break;

    case 'budget_exceeded':
      if (result.details.budgetConstraint === 'cost') {
        steps.push('Increase max_cost_usd in config');
        steps.push('Or optimize LLM prompts to reduce token usage');
      } else if (result.details.budgetConstraint === 'duration') {
        steps.push('Increase max_duration_minutes in config');
        steps.push('Or simplify the objective');
      } else if (result.details.budgetConstraint === 'iterations') {
        steps.push('Increase max_iterations in config');
        steps.push('Or review test failures for systemic issues');
      }
      steps.push('Review progress so far - partial success may be acceptable');
      break;

    case 'entropy_detected':
      steps.push('⚠️  Same error repeating - manual intervention needed');
      steps.push('Review last test failure for systemic issues');
      steps.push('Check if test expectations are correct');
      steps.push('Verify dependencies and environment');
      steps.push('Consider adjusting the objective or providing more context');
      break;

    case 'max_iterations':
      steps.push('Maximum iterations reached without success');
      steps.push('Review test failures for patterns');
      steps.push('Consider increasing max_iterations');
      steps.push('Or simplify the objective');
      break;

    case 'error':
      steps.push('❌ Catastrophic error occurred');
      steps.push('Check logs for error details');
      steps.push('Verify environment configuration');
      steps.push('Report issue if unexpected');
      break;
  }

  return steps;
}

/**
 * Create completion summary
 */
export function createCompletionSummary(
  result: CompletionStatusResult,
  budgetStatus: BudgetStatus,
  testResults: RalphTestResult | null,
): {
  status: CompletionStatus;
  success: boolean;
  iterations: number;
  cost: number;
  duration: number;
  testsPassed: number;
  testsFailed: number;
  testsTotal: number;
  message: string;
} {
  return {
    status: result.status,
    success: isSuccessStatus(result.status),
    iterations: result.details.iterations,
    cost: budgetStatus.totalCost,
    duration: budgetStatus.elapsedMinutes,
    testsPassed: testResults?.summary.passed || 0,
    testsFailed: testResults?.summary.failed || 0,
    testsTotal: testResults?.summary.total || 0,
    message: result.reason,
  };
}
