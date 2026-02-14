#!/usr/bin/env node
/**
 * Coverage Validation Script
 *
 * Validates that test coverage meets the 95% threshold
 * as specified in SC-011 (System Constitution).
 *
 * Usage: npm run validate:coverage
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

interface CoverageData {
  total: CoverageMetrics;
  files: Record<string, CoverageMetrics>;
}

interface CoverageMetrics {
  lines: MetricDetail;
  statements: MetricDetail;
  functions: MetricDetail;
  branches: MetricDetail;
}

interface MetricDetail {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}

interface ValidationResult {
  passed: boolean;
  threshold: number;
  actual: {
    lines: number;
    statements: number;
    functions: number;
    branches: number;
    overall: number;
  };
  violations: string[];
}

/**
 * SC-011 Coverage Requirements
 */
const COVERAGE_THRESHOLD = 95; // Per SC-011

/**
 * Parse coverage data from coverage-summary.json
 */
async function parseCoverageData(): Promise<CoverageData | null> {
  const coveragePath = path.join(
    __dirname,
    '../coverage/coverage-summary.json'
  );

  try {
    const content = await fs.readFile(coveragePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('Coverage data not found. Run tests with coverage first.');
    return null;
  }
}

/**
 * Generate coverage report
 */
function generateCoverageReport(): void {
  console.log('📊 Generating coverage report...\n');

  try {
    // Run tests with coverage
    execSync('npm run test:coverage', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
  } catch (error) {
    console.error('Failed to generate coverage report');
    throw error;
  }
}

/**
 * Validate coverage against threshold
 */
function validateCoverage(data: CoverageData): ValidationResult {
  const total = data.total;
  const violations: string[] = [];

  // Check each metric
  if (total.lines.pct < COVERAGE_THRESHOLD) {
    violations.push(
      `Lines coverage ${total.lines.pct.toFixed(2)}% < ${COVERAGE_THRESHOLD}%`
    );
  }

  if (total.statements.pct < COVERAGE_THRESHOLD) {
    violations.push(
      `Statements coverage ${total.statements.pct.toFixed(2)}% < ${COVERAGE_THRESHOLD}%`
    );
  }

  if (total.functions.pct < COVERAGE_THRESHOLD) {
    violations.push(
      `Functions coverage ${total.functions.pct.toFixed(2)}% < ${COVERAGE_THRESHOLD}%`
    );
  }

  if (total.branches.pct < COVERAGE_THRESHOLD) {
    violations.push(
      `Branches coverage ${total.branches.pct.toFixed(2)}% < ${COVERAGE_THRESHOLD}%`
    );
  }

  // Calculate overall coverage
  const overall =
    (total.lines.pct +
      total.statements.pct +
      total.functions.pct +
      total.branches.pct) /
    4;

  return {
    passed: violations.length === 0,
    threshold: COVERAGE_THRESHOLD,
    actual: {
      lines: total.lines.pct,
      statements: total.statements.pct,
      functions: total.functions.pct,
      branches: total.branches.pct,
      overall,
    },
    violations,
  };
}

/**
 * Find files with low coverage
 */
function findLowCoverageFiles(
  data: CoverageData,
  threshold: number = 80
): Array<{ file: string; coverage: number }> {
  const lowCoverageFiles: Array<{ file: string; coverage: number }> = [];

  for (const [filePath, metrics] of Object.entries(data.files)) {
    // Skip total
    if (filePath === 'total') continue;

    // Calculate file overall coverage
    const coverage =
      (metrics.lines.pct +
        metrics.statements.pct +
        metrics.functions.pct +
        metrics.branches.pct) /
      4;

    if (coverage < threshold) {
      lowCoverageFiles.push({
        file: filePath.replace(path.join(__dirname, '..'), ''),
        coverage,
      });
    }
  }

  return lowCoverageFiles.sort((a, b) => a.coverage - b.coverage);
}

/**
 * Display coverage report
 */
function displayReport(data: CoverageData, result: ValidationResult): void {
  console.log('\n📊 Coverage Report');
  console.log('==================\n');

  console.log(`Threshold: ${result.threshold}%`);
  console.log(`\n📈 Overall Metrics:`);
  console.log(`  Lines:      ${result.actual.lines.toFixed(2)}%`);
  console.log(`  Statements: ${result.actual.statements.toFixed(2)}%`);
  console.log(`  Functions:  ${result.actual.functions.toFixed(2)}%`);
  console.log(`  Branches:   ${result.actual.branches.toFixed(2)}%`);
  console.log(`  Overall:    ${result.actual.overall.toFixed(2)}%`);

  // Find low coverage files
  const lowCoverageFiles = findLowCoverageFiles(data, 80);

  if (lowCoverageFiles.length > 0) {
    console.log(`\n⚠️  Files Below 80% Coverage:`);
    lowCoverageFiles.slice(0, 10).forEach(({ file, coverage }) => {
      console.log(`  - ${file}: ${coverage.toFixed(2)}%`);
    });

    if (lowCoverageFiles.length > 10) {
      console.log(
        `  ... and ${lowCoverageFiles.length - 10} more files`
      );
    }
  }

  // SC-011 Compliance
  console.log(`\n🔒 SC-011 Compliance Check:`);
  if (result.passed) {
    console.log(`  ✅ PASSED - All metrics meet ${result.threshold}% threshold`);
  } else {
    console.log(`  ❌ FAILED - Violations detected:`);
    result.violations.forEach(v => console.log(`     - ${v}`));
  }
}

/**
 * Create coverage improvement plan
 */
function createImprovementPlan(data: CoverageData): void {
  const lowCoverageFiles = findLowCoverageFiles(data, 80);

  if (lowCoverageFiles.length === 0) {
    return;
  }

  console.log(`\n📝 Coverage Improvement Plan:`);
  console.log(`\n  Priority files to test (lowest coverage first):\n`);

  lowCoverageFiles.slice(0, 5).forEach((item, index) => {
    const fileMetrics = data.files[item.file];
    console.log(`  ${index + 1}. ${item.file}`);
    console.log(`     Current: ${item.coverage.toFixed(2)}%`);
    console.log(
      `     Lines to cover: ${fileMetrics.lines.total - fileMetrics.lines.covered}`
    );
    console.log(
      `     Functions to cover: ${fileMetrics.functions.total - fileMetrics.functions.covered}`
    );
    console.log('');
  });

  console.log(`  Suggested actions:`);
  console.log(`    1. Add unit tests for uncovered functions`);
  console.log(`    2. Add integration tests for uncovered branches`);
  console.log(`    3. Add edge case tests for error paths`);
  console.log(`    4. Review and remove dead code if applicable`);
}

/**
 * Main validation function
 */
async function main() {
  console.log('🚀 Ralph Loop 2026 - Coverage Validation');
  console.log('========================================\n');

  console.log(`SC-011 Requirement: ${COVERAGE_THRESHOLD}% coverage threshold\n`);

  // Check if coverage data exists
  let data = await parseCoverageData();

  if (!data) {
    console.log('No existing coverage data found.');
    console.log('Generating coverage report...\n');

    try {
      generateCoverageReport();
      data = await parseCoverageData();
    } catch (error) {
      console.error('\n❌ Failed to generate coverage report');
      console.error('   Run: npm run test:coverage');
      process.exit(1);
    }
  }

  if (!data) {
    console.error('❌ Could not load coverage data');
    process.exit(1);
  }

  // Validate coverage
  const result = validateCoverage(data);

  // Display report
  displayReport(data, result);

  // Create improvement plan if needed
  if (!result.passed) {
    createImprovementPlan(data);
  }

  // Exit with appropriate code
  if (result.passed) {
    console.log('\n✅ Coverage validation PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ Coverage validation FAILED');
    console.log(`\n   Coverage must meet ${COVERAGE_THRESHOLD}% threshold per SC-011`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { parseCoverageData, validateCoverage, findLowCoverageFiles };
