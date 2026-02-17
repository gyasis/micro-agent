/**
 * Test Runner
 *
 * Executes tests for the target file/project and returns unified test results.
 * Supports multiple test frameworks via auto-detection and parsing.
 *
 * @module testing/test-runner
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { detectFramework, getDefaultTestCommand } from '../parsers/framework-detector';
import { parserRegistry } from '../parsers/base-parser';
import { JestParser } from '../parsers/jest-parser';
import { PytestParser } from '../parsers/pytest-parser';
import { CargoParser } from '../parsers/cargo-parser';
import type { RalphTestResult } from '../parsers/base-parser';
import type { Logger } from '../utils/logger';

const execAsync = promisify(exec);

export interface TestRunOptions {
  workingDirectory: string;
  testCommand?: string;
  timeout?: number; // milliseconds
  env?: Record<string, string>;
}

export interface TestRunResult {
  success: boolean;
  results: RalphTestResult;
  stdout: string;
  stderr: string;
  duration: number;
  error?: string;
}

/**
 * Test Runner Class
 */
export class TestRunner {
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
    this.registerParsers();
  }

  /**
   * Register all available parsers
   */
  private registerParsers(): void {
    parserRegistry.register(new JestParser());
    parserRegistry.register(new PytestParser());
    parserRegistry.register(new CargoParser());
  }

  /**
   * Run tests and return unified results
   */
  async runTests(options: TestRunOptions): Promise<TestRunResult> {
    const startTime = Date.now();

    try {
      this.logger?.info('Starting test execution', {
        workingDirectory: options.workingDirectory,
        testCommand: options.testCommand,
      });

      // Step 1: Detect framework from working directory (always run for parser selection)
      let testCommand = options.testCommand;
      const detection = await detectFramework(options.workingDirectory);
      let framework = detection.framework;

      if (!testCommand) {
        testCommand = detection.command || getDefaultTestCommand(framework);
        this.logger?.info('Framework detected', {
          framework,
          confidence: detection.confidence,
          command: testCommand,
        });
      } else {
        this.logger?.info('Using provided test command', {
          command: testCommand,
          detectedFramework: framework,
        });
      }

      // Step 2: Execute tests
      this.logger?.info('Executing test command', { command: testCommand });

      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: options.workingDirectory,
        timeout: options.timeout || 120000, // 2 minutes default
        env: {
          ...process.env,
          ...options.env,
          // Force non-interactive mode
          CI: 'true',
          NO_COLOR: '1',
        },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      // Step 3: Parse results
      const results = await this.parseTestOutput(
        stdout,
        stderr,
        testCommand,
        framework
      );

      const duration = Date.now() - startTime;

      this.logger?.info('Tests completed', {
        status: results.summary.status,
        total: results.summary.total,
        passed: results.summary.passed,
        failed: results.summary.failed,
        duration,
      });

      return {
        success: results.summary.status === 'passed',
        results,
        stdout,
        stderr,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.logger?.error('Test execution failed', error);

      // Try to parse output even on failure (tests might have failed but still produced output)
      try {
        const results = await this.parseTestOutput(
          error.stdout || '',
          error.stderr || '',
          options.testCommand || 'unknown'
        );

        return {
          success: false,
          results,
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          duration,
          error: error.message,
        };
      } catch (parseError) {
        // Return empty result if parsing fails
        return {
          success: false,
          results: this.createErrorResult(error.message),
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          duration,
          error: error.message,
        };
      }
    }
  }

  /**
   * Parse test output using appropriate parser
   */
  private async parseTestOutput(
    stdout: string,
    stderr: string,
    command: string,
    detectedFramework?: string
  ): Promise<RalphTestResult> {
    // Combine stdout and stderr for parsing
    const fullOutput = stdout + '\n' + stderr;

    // Determine framework from command or detection
    let framework = detectedFramework;

    if (!framework) {
      framework = this.detectFrameworkFromCommand(command);
    }

    // Get parser for framework
    const parser = parserRegistry.get(framework as any);

    if (!parser) {
      this.logger?.warn('No parser found for framework', { framework });
      return this.createErrorResult(`No parser for framework: ${framework}`);
    }

    // Parse output
    try {
      const result = await parser.parse(fullOutput);

      // Validate result
      if (!parser.validate(result)) {
        this.logger?.warn('Parser validation failed', { framework });
        return this.createErrorResult('Parser validation failed');
      }

      return result;
    } catch (error: any) {
      this.logger?.error('Failed to parse test output', error);
      return this.createErrorResult(error.message);
    }
  }

  /**
   * Detect framework from test command
   */
  private detectFrameworkFromCommand(command: string): string {
    const lowerCommand = command.toLowerCase();

    if (lowerCommand.includes('vitest')) return 'vitest';
    if (lowerCommand.includes('jest')) return 'jest';
    if (lowerCommand.includes('mocha')) return 'mocha';
    if (lowerCommand.includes('pytest')) return 'pytest';
    if (lowerCommand.includes('cargo test')) return 'cargo';
    if (lowerCommand.includes('rspec')) return 'rspec';
    if (lowerCommand.includes('mvn test')) return 'junit';

    return 'custom';
  }

  /**
   * Create error result
   */
  private createErrorResult(errorMessage: string): RalphTestResult {
    return {
      framework: 'custom',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      summary: {
        total: 0,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration: 0,
        status: 'error',
      },
      tests: [
        {
          id: 'test-runner-error',
          name: 'Test Runner Error',
          file: 'unknown',
          status: 'error',
          duration: 0,
          error: {
            message: errorMessage,
          },
        },
      ],
    };
  }

  /**
   * Run tests with retries on failure
   */
  async runTestsWithRetry(
    options: TestRunOptions,
    maxRetries: number = 1
  ): Promise<TestRunResult> {
    let lastResult: TestRunResult | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        this.logger?.info(`Retry attempt ${attempt}/${maxRetries}`);
      }

      lastResult = await this.runTests(options);

      if (lastResult.success) {
        return lastResult;
      }

      // Don't retry if it was a parse error or timeout
      if (lastResult.error?.includes('timeout') || lastResult.error?.includes('parse')) {
        break;
      }
    }

    return lastResult!;
  }

  /**
   * Run tests for specific file
   */
  async runTestsForFile(
    filePath: string,
    options: Omit<TestRunOptions, 'testCommand'>
  ): Promise<TestRunResult> {
    // Detect framework
    const detection = await detectFramework(options.workingDirectory);
    let testCommand = detection.command || getDefaultTestCommand(detection.framework);

    // Add file filter to command
    testCommand = this.addFileFilterToCommand(testCommand, filePath, detection.framework);

    return this.runTests({
      ...options,
      testCommand,
    });
  }

  /**
   * Add file filter to test command
   */
  private addFileFilterToCommand(
    command: string,
    filePath: string,
    framework: string
  ): string {
    switch (framework) {
      case 'vitest':
      case 'jest':
        return `${command} ${filePath}`;
      case 'pytest':
        return `${command} ${filePath}`;
      case 'cargo':
        // Extract test name from file path
        const testName = filePath.replace(/.*\//, '').replace(/\.rs$/, '');
        return `${command} ${testName}`;
      default:
        return command;
    }
  }
}

/**
 * Factory function to create test runner
 */
export function createTestRunner(logger?: Logger): TestRunner {
  return new TestRunner(logger);
}
