/**
 * Budget Constraint Enforcer (T054)
 *
 * Enforces hard limits on iteration execution:
 * 1. max_cost_usd: Total LLM API costs
 * 2. max_iterations: Maximum number of iterations
 * 3. max_duration_minutes: Wall-clock time limit
 *
 * Integrates with IterationManager for real-time enforcement.
 *
 * @module lifecycle/budget-enforcer
 */

import { createLogger } from '../utils/logger';
import type { BudgetStatus } from './iteration-manager';

const logger = createLogger();

/**
 * Budget configuration
 */
export interface BudgetConfig {
  maxIterations: number;
  maxCostUsd: number;
  maxDurationMinutes: number;
}

/**
 * Budget enforcement result
 */
export interface BudgetEnforcementResult {
  allowed: boolean;
  constraint?: 'iterations' | 'cost' | 'duration';
  current: {
    iterations: number;
    costUsd: number;
    durationMinutes: number;
  };
  limits: BudgetConfig;
  message: string;
}

/**
 * Enforce budget constraints before iteration
 *
 * T054: Hard limits on cost, iterations, and duration
 */
export function enforceBudgetConstraints(
  budgetStatus: BudgetStatus,
  config: BudgetConfig,
): BudgetEnforcementResult {
  const result: BudgetEnforcementResult = {
    allowed: true,
    current: {
      iterations: budgetStatus.currentIteration,
      costUsd: budgetStatus.totalCost,
      durationMinutes: budgetStatus.elapsedMinutes,
    },
    limits: config,
    message: 'Budget constraints satisfied',
  };

  // Check iteration limit (hard stop)
  if (budgetStatus.currentIteration >= config.maxIterations) {
    result.allowed = false;
    result.constraint = 'iterations';
    result.message = `Maximum iterations reached: ${budgetStatus.currentIteration}/${config.maxIterations}`;
    logger.warn('🛑 Budget constraint: Maximum iterations', {
      current: budgetStatus.currentIteration,
      max: config.maxIterations,
    });
    return result;
  }

  // Check cost limit (hard stop)
  if (budgetStatus.totalCost >= config.maxCostUsd) {
    result.allowed = false;
    result.constraint = 'cost';
    result.message = `Maximum cost exceeded: $${budgetStatus.totalCost.toFixed(2)}/$${config.maxCostUsd.toFixed(2)}`;
    logger.warn('🛑 Budget constraint: Maximum cost', {
      current: budgetStatus.totalCost,
      max: config.maxCostUsd,
    });
    return result;
  }

  // Check duration limit (hard stop)
  if (budgetStatus.elapsedMinutes >= config.maxDurationMinutes) {
    result.allowed = false;
    result.constraint = 'duration';
    result.message = `Maximum duration exceeded: ${budgetStatus.elapsedMinutes.toFixed(1)}/${config.maxDurationMinutes} minutes`;
    logger.warn('🛑 Budget constraint: Maximum duration', {
      current: budgetStatus.elapsedMinutes,
      max: config.maxDurationMinutes,
    });
    return result;
  }

  // All constraints satisfied
  logger.debug('Budget constraints satisfied', {
    iterations: `${budgetStatus.currentIteration}/${config.maxIterations}`,
    cost: `$${budgetStatus.totalCost.toFixed(2)}/$${config.maxCostUsd.toFixed(2)}`,
    duration: `${budgetStatus.elapsedMinutes.toFixed(1)}/${config.maxDurationMinutes} min`,
  });

  return result;
}

/**
 * Calculate budget utilization percentages
 */
export function calculateBudgetUtilization(
  budgetStatus: BudgetStatus,
  config: BudgetConfig,
): {
  iterations: number;
  cost: number;
  duration: number;
  overall: number;
} {
  const iterationPct =
    (budgetStatus.currentIteration / config.maxIterations) * 100;
  const costPct = (budgetStatus.totalCost / config.maxCostUsd) * 100;
  const durationPct =
    (budgetStatus.elapsedMinutes / config.maxDurationMinutes) * 100;

  // Overall utilization is the maximum of all three
  const overall = Math.max(iterationPct, costPct, durationPct);

  return {
    iterations: iterationPct,
    cost: costPct,
    duration: durationPct,
    overall,
  };
}

/**
 * Estimate remaining budget
 */
export function estimateRemainingBudget(
  budgetStatus: BudgetStatus,
  config: BudgetConfig,
): {
  remainingIterations: number;
  remainingCostUsd: number;
  remainingMinutes: number;
  canContinue: boolean;
} {
  const remainingIterations =
    config.maxIterations - budgetStatus.currentIteration;
  const remainingCostUsd = config.maxCostUsd - budgetStatus.totalCost;
  const remainingMinutes =
    config.maxDurationMinutes - budgetStatus.elapsedMinutes;

  const canContinue =
    remainingIterations > 0 && remainingCostUsd > 0 && remainingMinutes > 0;

  return {
    remainingIterations: Math.max(0, remainingIterations),
    remainingCostUsd: Math.max(0, remainingCostUsd),
    remainingMinutes: Math.max(0, remainingMinutes),
    canContinue,
  };
}

/**
 * Format budget status for display
 */
export function formatBudgetStatus(
  budgetStatus: BudgetStatus,
  config: BudgetConfig,
): string {
  const utilization = calculateBudgetUtilization(budgetStatus, config);
  const remaining = estimateRemainingBudget(budgetStatus, config);

  const lines: string[] = [];

  lines.push('Budget Status:');
  lines.push('');

  // Iterations
  lines.push(
    `Iterations: ${budgetStatus.currentIteration}/${config.maxIterations} (${utilization.iterations.toFixed(0)}%)`,
  );
  lines.push(`  Remaining: ${remaining.remainingIterations}`);
  lines.push('');

  // Cost
  lines.push(
    `Cost: $${budgetStatus.totalCost.toFixed(2)}/$${config.maxCostUsd.toFixed(2)} (${utilization.cost.toFixed(0)}%)`,
  );
  lines.push(`  Remaining: $${remaining.remainingCostUsd.toFixed(2)}`);
  lines.push('');

  // Duration
  lines.push(
    `Duration: ${budgetStatus.elapsedMinutes.toFixed(1)}/${config.maxDurationMinutes} min (${utilization.duration.toFixed(0)}%)`,
  );
  lines.push(`  Remaining: ${remaining.remainingMinutes.toFixed(1)} min`);
  lines.push('');

  // Overall
  const statusIcon = budgetStatus.withinBudget ? '✅' : '❌';
  lines.push(
    `${statusIcon} Overall Utilization: ${utilization.overall.toFixed(0)}%`,
  );

  if (!budgetStatus.withinBudget) {
    lines.push(`Reason: ${budgetStatus.reason}`);
  }

  return lines.join('\n');
}

/**
 * Predict if next iteration will exceed budget
 */
export function predictBudgetOverrun(
  budgetStatus: BudgetStatus,
  config: BudgetConfig,
  averageIterationCost: number,
  averageIterationDuration: number,
): {
  willOverrun: boolean;
  constraint?: 'iterations' | 'cost' | 'duration';
  reason?: string;
} {
  // Check if next iteration would exceed limits
  const nextIteration = budgetStatus.currentIteration + 1;
  const projectedCost = budgetStatus.totalCost + averageIterationCost;
  const projectedDuration =
    budgetStatus.elapsedMinutes + averageIterationDuration;

  // Iterations
  if (nextIteration > config.maxIterations) {
    return {
      willOverrun: true,
      constraint: 'iterations',
      reason: `Next iteration would exceed max iterations (${nextIteration} > ${config.maxIterations})`,
    };
  }

  // Cost
  if (projectedCost > config.maxCostUsd) {
    return {
      willOverrun: true,
      constraint: 'cost',
      reason: `Next iteration would exceed max cost ($${projectedCost.toFixed(2)} > $${config.maxCostUsd.toFixed(2)})`,
    };
  }

  // Duration
  if (projectedDuration > config.maxDurationMinutes) {
    return {
      willOverrun: true,
      constraint: 'duration',
      reason: `Next iteration would exceed max duration (${projectedDuration.toFixed(1)} > ${config.maxDurationMinutes} min)`,
    };
  }

  return { willOverrun: false };
}

/**
 * Budget warning thresholds
 */
export const BUDGET_WARNING_THRESHOLDS = {
  iterations: 0.8, // Warn at 80% utilization
  cost: 0.8,
  duration: 0.8,
};

/**
 * Check if budget warning should be issued
 */
export function shouldWarnBudget(
  budgetStatus: BudgetStatus,
  config: BudgetConfig,
): {
  shouldWarn: boolean;
  warnings: string[];
} {
  const utilization = calculateBudgetUtilization(budgetStatus, config);
  const warnings: string[] = [];

  // Check each constraint
  if (utilization.iterations >= BUDGET_WARNING_THRESHOLDS.iterations * 100) {
    warnings.push(
      `Iterations: ${utilization.iterations.toFixed(0)}% used (${budgetStatus.currentIteration}/${config.maxIterations})`,
    );
  }

  if (utilization.cost >= BUDGET_WARNING_THRESHOLDS.cost * 100) {
    warnings.push(
      `Cost: ${utilization.cost.toFixed(0)}% used ($${budgetStatus.totalCost.toFixed(2)}/$${config.maxCostUsd.toFixed(2)})`,
    );
  }

  if (utilization.duration >= BUDGET_WARNING_THRESHOLDS.duration * 100) {
    warnings.push(
      `Duration: ${utilization.duration.toFixed(0)}% used (${budgetStatus.elapsedMinutes.toFixed(1)}/${config.maxDurationMinutes} min)`,
    );
  }

  return {
    shouldWarn: warnings.length > 0,
    warnings,
  };
}
