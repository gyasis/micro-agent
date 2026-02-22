/**
 * State Machine Guard Conditions
 *
 * Guards determine whether state transitions should occur based on
 * context conditions, budget constraints, and success criteria.
 *
 * @module state-machine/guards
 */

import type { RalphContext } from './ralph-machine';

export interface SuccessCriteria {
  testsPass: boolean;
  adversarialTestsPass?: boolean;
  coverageThreshold?: number;
  mutationScoreMin?: number;
  linterErrors?: boolean;
}

export interface BudgetConstraints {
  maxIterations: number;
  maxCostUsd: number;
  maxDurationMinutes: number;
}

/**
 * Check if tests pass
 */
export function testsPass(context: RalphContext): boolean {
  if (!context.testResults) return false;
  return context.testResults.status === 'pass';
}

/**
 * Check if adversarial tests pass
 */
export function adversarialTestsPass(context: RalphContext): boolean {
  if (!context.adversarialResults) return false;
  return context.adversarialResults.status === 'pass';
}

/**
 * Check if coverage threshold met
 */
export function coverageThresholdMet(
  context: RalphContext,
  threshold: number,
): boolean {
  if (!context.testResults?.coverage) return false;
  return context.testResults.coverage.linePercentage >= threshold;
}

/**
 * Check if mutation score meets minimum
 */
export function mutationScoreMet(
  context: RalphContext,
  minimum: number,
): boolean {
  if (!context.adversarialResults?.mutationScore) return false;
  return context.adversarialResults.mutationScore >= minimum;
}

/**
 * Check if success criteria are met
 */
export function successCriteriaMet(
  context: RalphContext,
  criteria: SuccessCriteria,
): boolean {
  // Required: tests must pass
  if (criteria.testsPass && !testsPass(context)) {
    return false;
  }

  // Optional: adversarial tests
  if (criteria.adversarialTestsPass && !adversarialTestsPass(context)) {
    return false;
  }

  // Optional: coverage threshold
  if (criteria.coverageThreshold !== undefined) {
    if (!coverageThresholdMet(context, criteria.coverageThreshold)) {
      return false;
    }
  }

  // Optional: mutation score
  if (criteria.mutationScoreMin !== undefined) {
    if (!mutationScoreMet(context, criteria.mutationScoreMin)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if budget is exceeded
 */
export function budgetExceeded(
  iteration: number,
  totalCost: number,
  elapsedMinutes: number,
  constraints: BudgetConstraints,
): boolean {
  if (iteration >= constraints.maxIterations) return true;
  if (totalCost >= constraints.maxCostUsd) return true;
  if (elapsedMinutes >= constraints.maxDurationMinutes) return true;
  return false;
}

/**
 * Check if context reset should occur
 */
export function shouldResetContext(
  contextUsage: Map<string, number>,
  contextLimits: Map<string, number>,
): boolean {
  const SMART_ZONE_LIMIT = 0.4; // 40%

  for (const [agent, tokens] of contextUsage.entries()) {
    const limit = contextLimits.get(agent);
    if (!limit) continue;

    const percentage = tokens / limit;
    if (percentage >= SMART_ZONE_LIMIT) {
      return true;
    }
  }

  return false;
}

/**
 * Check if adversarial testing should run
 */
export function shouldRunAdversarialTests(context: RalphContext): boolean {
  // Only run adversarial tests if unit tests pass
  return testsPass(context);
}

/**
 * Check if iteration can continue
 */
export function canContinueIteration(
  context: RalphContext,
  iteration: number,
  totalCost: number,
  elapsedMinutes: number,
  constraints: BudgetConstraints,
): boolean {
  // Budget check
  if (budgetExceeded(iteration, totalCost, elapsedMinutes, constraints)) {
    return false;
  }

  // Context reset check (if required, iteration should end)
  // This is handled separately by context monitor

  // If we have errors and entropy detected, should not continue
  if (context.errors.length > 0) {
    // Check for entropy (handled by iteration manager)
  }

  return true;
}

/**
 * Determine completion status
 */
export function determineCompletionStatus(
  context: RalphContext,
  criteria: SuccessCriteria,
  iteration: number,
  totalCost: number,
  elapsedMinutes: number,
  constraints: BudgetConstraints,
  entropyDetected: boolean,
): {
  status:
    | 'success'
    | 'budget_exceeded'
    | 'entropy_detected'
    | 'max_iterations'
    | 'error';
  message: string;
} {
  // Check success first
  if (successCriteriaMet(context, criteria)) {
    return {
      status: 'success',
      message: `All success criteria met (iteration ${iteration})`,
    };
  }

  // Check entropy
  if (entropyDetected) {
    return {
      status: 'entropy_detected',
      message: 'Circuit breaker triggered - identical errors detected 3 times',
    };
  }

  // Check budget
  if (iteration >= constraints.maxIterations) {
    return {
      status: 'max_iterations',
      message: `Maximum iterations reached (${constraints.maxIterations})`,
    };
  }

  if (totalCost >= constraints.maxCostUsd) {
    return {
      status: 'budget_exceeded',
      message: `Cost limit exceeded ($${totalCost.toFixed(2)} / $${constraints.maxCostUsd.toFixed(2)})`,
    };
  }

  if (elapsedMinutes >= constraints.maxDurationMinutes) {
    return {
      status: 'budget_exceeded',
      message: `Duration limit exceeded (${elapsedMinutes.toFixed(1)} / ${constraints.maxDurationMinutes} minutes)`,
    };
  }

  // Check for errors in final state
  if (context.errors.length > 0) {
    return {
      status: 'error',
      message: `Execution failed with ${context.errors.length} error(s)`,
    };
  }

  // Default to budget exceeded if we're here
  return {
    status: 'budget_exceeded',
    message: 'Iteration limit reached without meeting success criteria',
  };
}
