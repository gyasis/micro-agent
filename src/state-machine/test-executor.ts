/**
 * Test Executor
 *
 * T048 & T049 Implementation:
 * - Integrates framework detector with test execution
 * - Wires test parsers to generate unified ralph-test-json output
 * - Supports TypeScript/JavaScript (Vitest/Jest), Python (pytest), Rust (cargo test)
 *
 * @module state-machine/test-executor
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { detectFramework, getDefaultTestCommand, type TestFramework } from '../parsers/framework-detector';
import type { RalphTestResult } from '../parsers/base-parser';
import { JestParser } from '../parsers/jest-parser';
import { PytestParser } from '../parsers/pytest-parser';
import { CargoParser } from '../parsers/cargo-parser';
import { createLogger } from '../utils/logger';

const execAsync = promisify(exec);
const logger = createLogger();

/**
 * Test execution options
 */
export interface TestExecutionOptions {
  projectDir: string;
  targetFile?: string;
  timeout?: number; // milliseconds
  environment?: Record<string, string>;
}

/**
 * Test execution result
 */
export interface TestExecutionResult {
  success: boolean;
  framework: TestFramework;
  testResults: RalphTestResult;
  duration: number;
  command: string;
  error?: string;
}

/**
 * Execute tests for the project
 *
 * T048 & T049: Integrates framework detector and test parsers
 */
export async function executeTests(options: TestExecutionOptions): Promise<TestExecutionResult> {
  const startTime = Date.now();
  const { projectDir, targetFile, timeout = 120000, environment = {} } = options;

  logger.info('Detecting test framework...', { projectDir });

  // T048: Detect test framework
  const detection = await detectFramework(projectDir);
  const framework = detection.framework;

  logger.info('Framework detected', {
    framework,
    confidence: detection.confidence,
    command: detection.command,
    details: detection.details,
  });

  // Get test command
  const testCommand = detection.command || getDefaultTestCommand(framework);

  // Add framework-specific flags for JSON output and non-watch mode
  const enhancedCommand = enhanceTestCommand(testCommand, framework, targetFile);

  logger.info('Executing tests', { command: enhancedCommand });

  try {
    // Execute test command
    const { stdout, stderr } = await execAsync(enhancedCommand, {
      cwd: projectDir,
      timeout,
      env: { ...process.env, ...environment },
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large test outputs
    });

    const output = stdout + stderr;
    const duration = Date.now() - startTime;

    // T049: Parse test output using appropriate parser
    const testResults = await parseTestOutput(framework, output);

    // Update duration from actual execution time
    testResults.summary.duration = duration / 1000;

    const success = testResults.summary.status === 'passed';

    logger.info('Tests executed', {
      framework,
      success,
      total: testResults.summary.total,
      passed: testResults.summary.passed,
      failed: testResults.summary.failed,
      duration: `${testResults.summary.duration}s`,
    });

    return {
      success,
      framework,
      testResults,
      duration,
      command: enhancedCommand,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Test failure (exit code non-zero) is expected when tests fail
    // Parse the output even if command failed
    if (error.stdout || error.stderr) {
      const output = (error.stdout || '') + (error.stderr || '');

      try {
        const testResults = await parseTestOutput(framework, output);
        testResults.summary.duration = duration / 1000;

        const success = testResults.summary.status === 'passed';

        logger.info('Tests executed with failures', {
          framework,
          success,
          total: testResults.summary.total,
          passed: testResults.summary.passed,
          failed: testResults.summary.failed,
          duration: `${testResults.summary.duration}s`,
        });

        return {
          success,
          framework,
          testResults,
          duration,
          command: enhancedCommand,
        };
      } catch (parseError) {
        logger.error('Failed to parse test output after test failure', parseError);
      }
    }

    // Catastrophic error (timeout, command not found, etc.)
    logger.error('Test execution failed catastrophically', {
      error: error.message,
      code: error.code,
      signal: error.signal,
    });

    // Create error result
    const errorResult: RalphTestResult = {
      framework,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: duration / 1000,
        status: 'error',
      },
      tests: [],
      metadata: {
        command: enhancedCommand,
        workingDirectory: projectDir,
        error: error.message,
      },
    };

    return {
      success: false,
      framework,
      testResults: errorResult,
      duration,
      command: enhancedCommand,
      error: error.message,
    };
  }
}

/**
 * Enhance test command with framework-specific flags
 */
function enhanceTestCommand(
  baseCommand: string,
  framework: TestFramework,
  targetFile?: string
): string {
  let enhanced = baseCommand;

  switch (framework) {
    case 'vitest':
      // Add --run (no watch) and --reporter=json
      if (!enhanced.includes('--run')) {
        enhanced += ' --run';
      }
      if (!enhanced.includes('--reporter')) {
        enhanced += ' --reporter=json';
      }
      break;

    case 'jest':
      // Add --no-watch and --json
      if (!enhanced.includes('--no-watch')) {
        enhanced += ' --no-watch';
      }
      if (!enhanced.includes('--json')) {
        enhanced += ' --json';
      }
      break;

    case 'pytest':
      // Add --tb=short (short traceback) and --json-report
      if (!enhanced.includes('--tb')) {
        enhanced += ' --tb=short';
      }
      // pytest-json-report plugin for JSON output
      if (!enhanced.includes('--json-report')) {
        enhanced += ' --json-report --json-report-file=/tmp/pytest-report.json';
      }
      break;

    case 'cargo':
      // Add --message-format=json for JSON output
      if (!enhanced.includes('--message-format')) {
        enhanced += ' --message-format=json';
      }
      break;

    default:
      // For unknown frameworks, try to disable watch mode
      if (enhanced.includes('npm') && !enhanced.includes('--')) {
        enhanced += ' --';
      }
  }

  // Add target file filter if specified
  if (targetFile) {
    enhanced += ` ${path.basename(targetFile, path.extname(targetFile))}`;
  }

  return enhanced;
}

/**
 * T049: Parse test output using appropriate parser
 */
async function parseTestOutput(framework: TestFramework, output: string): Promise<RalphTestResult> {
  logger.debug('Parsing test output', { framework, outputLength: output.length });

  switch (framework) {
    case 'vitest':
    case 'jest': {
      const parser = new JestParser();
      return await parser.parse(output);
    }

    case 'pytest': {
      const parser = new PytestParser();
      return await parser.parse(output);
    }

    case 'cargo': {
      const parser = new CargoParser();
      return await parser.parse(output);
    }

    default: {
      // Fallback: Try parsing as Jest format (most common)
      logger.warn('Unknown framework, attempting Jest parser', { framework });
      const parser = new JestParser();
      return await parser.parse(output);
    }
  }
}

/**
 * Validate test result meets minimum quality threshold
 */
export function validateTestResult(result: RalphTestResult): boolean {
  // Must have run at least one test
  if (result.summary.total === 0) {
    logger.warn('No tests found in test run');
    return false;
  }

  // Summary counts must match test array
  const actualCounts = {
    passed: result.tests.filter(t => t.status === 'passed').length,
    failed: result.tests.filter(t => t.status === 'failed').length,
    skipped: result.tests.filter(t => t.status === 'skipped').length,
  };

  const total = actualCounts.passed + actualCounts.failed + actualCounts.skipped;

  if (total !== result.summary.total) {
    logger.warn('Test count mismatch', {
      expected: result.summary.total,
      actual: total,
    });
    return false;
  }

  return true;
}
