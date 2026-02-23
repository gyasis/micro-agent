/**
 * Cargo Test Parser
 *
 * Parses cargo test output to ralph-test-json format.
 * Supports both standard and JSON output modes.
 *
 * @module parsers/cargo-parser
 */

import {
  BaseTestParser,
  type RalphTestResult,
  type TestCase,
  type TestError,
  parserRegistry,
} from './base-parser';
import type { TestFramework } from './framework-detector';

export class CargoParser extends BaseTestParser {
  readonly framework: TestFramework = 'cargo';

  /**
   * Parse cargo test output
   */
  async parse(output: string): Promise<RalphTestResult> {
    const result = this.createEmptyResult();

    try {
      // Try parsing JSON format (--format json)
      const json = this.tryParseJSON(output);

      if (json) {
        return this.parseJSONOutput(json);
      }

      // Fallback to text parsing
      return this.parseTextOutput(output);
    } catch (error) {
      result.summary.status = 'error';
      return result;
    }
  }

  /**
   * Try parsing as JSON
   */
  private tryParseJSON(output: string): any[] | null {
    const lines = output.split('\n').filter(Boolean);
    const jsonLines: any[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type) {
          jsonLines.push(parsed);
        }
      } catch {
        // Not JSON, skip
      }
    }

    return jsonLines.length > 0 ? jsonLines : null;
  }

  /**
   * Parse JSON output (cargo test --format json)
   */
  private parseJSONOutput(jsonLines: any[]): RalphTestResult {
    const result = this.createEmptyResult();
    const tests: TestCase[] = [];
    const testMap = new Map<string, Partial<TestCase>>();

    for (const line of jsonLines) {
      const type = line.type;

      if (type === 'test') {
        const name = line.name;
        const event = line.event;

        if (event === 'started') {
          testMap.set(name, {
            id: name,
            name,
            file: this.extractFileFromName(name),
            status: 'passed',
            duration: 0,
          });
        } else if (event === 'ok') {
          const test = testMap.get(name);
          if (test) {
            test.status = 'passed';
            test.duration = line.exec_time || 0;
          }
        } else if (event === 'failed') {
          const test = testMap.get(name);
          if (test) {
            test.status = 'failed';
            test.duration = line.exec_time || 0;
            test.error = {
              message: line.stdout || 'Test failed',
            };
          }
        } else if (event === 'ignored') {
          const test = testMap.get(name);
          if (test) {
            test.status = 'skipped';
          }
        }
      }
    }

    // Convert map to array
    for (const test of testMap.values()) {
      if (test.id && test.name && test.file) {
        tests.push(test as TestCase);
      }
    }

    result.tests = tests;
    result.summary = this.calculateSummary(tests);

    return result;
  }

  /**
   * Extract file name from test name
   */
  private extractFileFromName(name: string): string {
    // Cargo test names format: module::path::test_name
    const parts = name.split('::');

    if (parts.length > 1) {
      // Convert module path to file path
      const modulePath = parts.slice(0, -1).join('/');
      return `src/${modulePath}.rs`;
    }

    return 'unknown.rs';
  }

  /**
   * Parse text output (default cargo test output)
   */
  private parseTextOutput(output: string): RalphTestResult {
    const result = this.createEmptyResult();
    const tests: TestCase[] = [];
    const lines = output.split('\n');

    let inTestSection = false;
    let inFailureSection = false;
    let currentFailure: { name: string; lines: string[] } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect test section start
      if (line.includes('running') && line.includes('test')) {
        inTestSection = true;
        continue;
      }

      // Parse test results
      if (inTestSection) {
        const passMatch = line.match(/^test\s+([\w:]+)\s+\.\.\.\s+ok/);
        if (passMatch) {
          tests.push({
            id: passMatch[1],
            name: passMatch[1],
            file: this.extractFileFromName(passMatch[1]),
            status: 'passed',
            duration: 0,
          });
          continue;
        }

        const failMatch = line.match(/^test\s+([\w:]+)\s+\.\.\.\s+FAILED/);
        if (failMatch) {
          tests.push({
            id: failMatch[1],
            name: failMatch[1],
            file: this.extractFileFromName(failMatch[1]),
            status: 'failed',
            duration: 0,
            error: { message: 'Test failed' },
          });
          continue;
        }

        const ignoreMatch = line.match(/^test\s+([\w:]+)\s+\.\.\.\s+ignored/);
        if (ignoreMatch) {
          tests.push({
            id: ignoreMatch[1],
            name: ignoreMatch[1],
            file: this.extractFileFromName(ignoreMatch[1]),
            status: 'skipped',
            duration: 0,
          });
          continue;
        }

        // End of test section
        if (line.startsWith('test result:')) {
          inTestSection = false;
        }
      }

      // Detect failure section
      if (line.includes('failures:')) {
        inFailureSection = true;
        continue;
      }

      // Parse failure details
      if (inFailureSection) {
        if (line.startsWith('----') && line.includes('----')) {
          // New failure section
          const failureNameMatch = line.match(/---- ([\w:]+) stdout ----/);

          if (currentFailure) {
            this.attachFailureToTest(tests, currentFailure);
          }

          if (failureNameMatch) {
            currentFailure = {
              name: failureNameMatch[1],
              lines: [],
            };
          }
        } else if (
          currentFailure &&
          line.trim() &&
          !line.startsWith('failures:')
        ) {
          currentFailure.lines.push(line);
        }

        // End of failures
        if (line.startsWith('test result:')) {
          if (currentFailure) {
            this.attachFailureToTest(tests, currentFailure);
            currentFailure = null;
          }
          inFailureSection = false;
        }
      }
    }

    result.tests = tests;
    result.summary = this.calculateSummary(tests);

    // Extract duration
    const durationMatch = output.match(/finished in\s+(\d+(?:\.\d+)?)\s*s/);
    if (durationMatch) {
      result.summary.duration = parseFloat(durationMatch[1]);
    }

    return result;
  }

  /**
   * Attach failure details to test
   */
  private attachFailureToTest(
    tests: TestCase[],
    failure: { name: string; lines: string[] },
  ): void {
    const test = tests.find((t) => t.name === failure.name);

    if (test && test.error) {
      // Extract assertion failure
      const assertMatch = failure.lines
        .join('\n')
        .match(/thread '.*' panicked at '(.*?)'/);

      if (assertMatch) {
        test.error.message = assertMatch[1];
      } else {
        test.error.message = failure.lines[0] || test.error.message;
      }

      test.error.stack = failure.lines.join('\n');

      // Extract expected/actual from assertion
      const expectedMatch = test.error.stack.match(/left:\s*`(.*?)`/);
      const actualMatch = test.error.stack.match(/right:\s*`(.*?)`/);

      if (expectedMatch && actualMatch) {
        test.error.expected = expectedMatch[1];
        test.error.actual = actualMatch[1];
      }
    }
  }
}

// Register parser
parserRegistry.register(new CargoParser());
