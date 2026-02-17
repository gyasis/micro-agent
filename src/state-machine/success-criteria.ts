/**
 * Success Criteria Evaluator (T053)
 *
 * Evaluates whether an iteration has met the success criteria:
 * 1. tests_pass: Unit tests must pass
 * 2. adversarial_tests_pass: Adversarial tests pass (optional)
 * 3. coverage_threshold: Code coverage meets minimum threshold
 *
 * @module state-machine/success-criteria
 */

import type { RalphTestResult } from '../parsers/base-parser';
import type { RalphConfig } from '../config/schema-validator';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Success criteria evaluation result
 */
export interface SuccessCriteriaResult {
  success: boolean;
  criteria: {
    testsPassed: boolean;
    adversarialPassed?: boolean;
    coverageThreshold?: boolean;
  };
  details: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    coveragePercentage?: number;
    coverageThreshold?: number;
    adversarialTotal?: number;
    adversarialPassed?: number;
  };
  message: string;
}

/**
 * Evaluate success criteria for an iteration
 *
 * T053: Implements success criteria evaluation logic
 */
export function evaluateSuccessCriteria(
  testResults: RalphTestResult | null,
  adversarialResults: any | null,
  config: RalphConfig
): SuccessCriteriaResult {
  // Initialize result
  const result: SuccessCriteriaResult = {
    success: false,
    criteria: {
      testsPassed: false,
      adversarialPassed: undefined,
      coverageThreshold: undefined,
    },
    details: {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
    },
    message: '',
  };

  // Check if tests exist
  if (!testResults) {
    result.message = 'No test results available';
    return result;
  }

  // Extract test summary
  const { summary } = testResults;
  result.details.totalTests = summary.total;
  result.details.passedTests = summary.passed;
  result.details.failedTests = summary.failed;

  // Criterion 1: Tests must pass
  result.criteria.testsPassed = summary.status === 'passed' && summary.failed === 0;

  if (!result.criteria.testsPassed) {
    result.message = `Tests failed: ${summary.failed}/${summary.total} tests failed`;
    logger.info('Success criteria: Tests failed', {
      passed: summary.passed,
      failed: summary.failed,
      total: summary.total,
    });
    return result;
  }

  logger.info('✓ Success criteria: Tests passed', {
    passed: summary.passed,
    total: summary.total,
  });

  // Criterion 2: Coverage threshold (optional)
  const coverageThreshold = config.testing?.coverageThreshold;
  if (coverageThreshold !== undefined && testResults.coverage) {
    const coverage = testResults.coverage;

    // Use line coverage as primary metric
    const coveragePercentage = coverage.lines?.percentage || 0;
    result.details.coveragePercentage = coveragePercentage;
    result.details.coverageThreshold = coverageThreshold;

    result.criteria.coverageThreshold = coveragePercentage >= coverageThreshold;

    if (!result.criteria.coverageThreshold) {
      result.message = `Coverage threshold not met: ${coveragePercentage.toFixed(1)}% < ${coverageThreshold}%`;
      logger.info('Success criteria: Coverage threshold not met', {
        coverage: coveragePercentage,
        threshold: coverageThreshold,
      });
      return result;
    }

    logger.info('✓ Success criteria: Coverage threshold met', {
      coverage: coveragePercentage,
      threshold: coverageThreshold,
    });
  }

  // Criterion 3: Adversarial tests (optional)
  if (config.testing?.adversarialTests && adversarialResults) {
    const adversarialPassed = adversarialResults.passed || adversarialResults.success || false;
    const adversarialTotal = adversarialResults.total || adversarialResults.testsRun || 0;
    const adversarialPassedCount = adversarialResults.passedCount || adversarialResults.passed || 0;

    result.criteria.adversarialPassed = adversarialPassed;
    result.details.adversarialTotal = adversarialTotal;
    result.details.adversarialPassed = adversarialPassedCount;

    if (!adversarialPassed) {
      // Adversarial failures are informational, not blocking
      logger.warn('⚠️  Adversarial tests failed (informational)', {
        passed: adversarialPassedCount,
        total: adversarialTotal,
      });
      result.message = `Success with adversarial warnings: ${adversarialTotal - adversarialPassedCount} adversarial tests failed`;
    } else {
      logger.info('✓ Success criteria: Adversarial tests passed', {
        passed: adversarialPassedCount,
        total: adversarialTotal,
      });
    }
  }

  // All required criteria met
  result.success = true;
  result.message = result.message || 'All success criteria met';

  return result;
}

/**
 * Check if iteration should proceed to adversarial testing
 */
export function shouldRunAdversarialTests(
  testResults: RalphTestResult | null,
  config: RalphConfig
): boolean {
  // Only run if:
  // 1. Enabled in config
  // 2. Unit tests passed
  // 3. Budget allows

  if (!config.testing?.adversarialTests) {
    return false;
  }

  if (!testResults || testResults.summary.status !== 'passed') {
    return false;
  }

  return true;
}

/**
 * Format success criteria result for display
 */
export function formatSuccessCriteria(result: SuccessCriteriaResult): string {
  const lines: string[] = [];

  lines.push('Success Criteria Evaluation:');
  lines.push('');

  // Tests
  const testIcon = result.criteria.testsPassed ? '✅' : '❌';
  lines.push(`${testIcon} Unit Tests: ${result.details.passedTests}/${result.details.totalTests} passed`);

  // Coverage
  if (result.details.coverageThreshold !== undefined) {
    const coverageIcon = result.criteria.coverageThreshold ? '✅' : '❌';
    lines.push(
      `${coverageIcon} Coverage: ${result.details.coveragePercentage?.toFixed(1)}% (threshold: ${result.details.coverageThreshold}%)`
    );
  }

  // Adversarial
  if (result.details.adversarialTotal !== undefined) {
    const adversarialIcon = result.criteria.adversarialPassed ? '✅' : '⚠️';
    lines.push(
      `${adversarialIcon} Adversarial: ${result.details.adversarialPassed}/${result.details.adversarialTotal} passed`
    );
  }

  lines.push('');
  lines.push(`Overall: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  lines.push(`Message: ${result.message}`);

  return lines.join('\n');
}

/**
 * Validate test results meet minimum quality requirements
 */
export function validateTestResults(testResults: RalphTestResult | null): {
  valid: boolean;
  reason?: string;
} {
  if (!testResults) {
    return { valid: false, reason: 'No test results available' };
  }

  // Must have run at least one test
  if (testResults.summary.total === 0) {
    return { valid: false, reason: 'No tests were executed' };
  }

  // Summary counts must be consistent
  const expectedTotal =
    testResults.summary.passed + testResults.summary.failed + testResults.summary.skipped;

  if (expectedTotal !== testResults.summary.total) {
    return {
      valid: false,
      reason: `Test count mismatch: expected ${testResults.summary.total}, got ${expectedTotal}`,
    };
  }

  // Test array must match summary
  if (testResults.tests.length !== testResults.summary.total) {
    return {
      valid: false,
      reason: `Test array length (${testResults.tests.length}) doesn't match summary total (${testResults.summary.total})`,
    };
  }

  return { valid: true };
}

/**
 * Extract failure information for error tracking
 */
export function extractTestFailures(testResults: RalphTestResult): Array<{
  testName: string;
  error: string;
  file: string;
  line?: number;
}> {
  const failures: Array<{
    testName: string;
    error: string;
    file: string;
    line?: number;
  }> = [];

  for (const test of testResults.tests) {
    if (test.status === 'failed' && test.error) {
      failures.push({
        testName: test.name,
        error: test.error.message,
        file: test.file,
        line: test.line,
      });
    }
  }

  return failures;
}

/**
 * Calculate test improvement metrics
 */
export function calculateTestMetrics(
  currentResults: RalphTestResult,
  previousResults: RalphTestResult | null
): {
  testsAdded: number;
  testsFixed: number;
  testsRegressed: number;
  coverageChange?: number;
} {
  const metrics = {
    testsAdded: 0,
    testsFixed: 0,
    testsRegressed: 0,
    coverageChange: undefined as number | undefined,
  };

  if (!previousResults) {
    // First iteration
    metrics.testsAdded = currentResults.summary.total;
    return metrics;
  }

  // Calculate changes
  metrics.testsAdded = currentResults.summary.total - previousResults.summary.total;
  metrics.testsFixed = previousResults.summary.failed - currentResults.summary.failed;
  metrics.testsRegressed = currentResults.summary.failed - previousResults.summary.failed;

  // Coverage change
  if (currentResults.coverage?.lines && previousResults.coverage?.lines) {
    metrics.coverageChange =
      currentResults.coverage.lines.percentage - previousResults.coverage.lines.percentage;
  }

  return metrics;
}
