/**
 * Pytest Parser
 *
 * Parses pytest test output to ralph-test-json format.
 * Supports both verbose and summary output modes.
 *
 * @module parsers/pytest-parser
 */

import {
  BaseTestParser,
  type RalphTestResult,
  type TestCase,
  type TestError,
  type CoverageData,
  type FileCoverage,
  parserRegistry,
} from './base-parser';
import type { TestFramework } from './framework-detector';
import { promises as fs } from 'fs';

export class PytestParser extends BaseTestParser {
  readonly framework: TestFramework = 'pytest';

  /**
   * Parse pytest output
   */
  async parse(output: string): Promise<RalphTestResult> {
    const result = this.createEmptyResult();

    try {
      // Try parsing as JSON (--json-report flag or pytest-json-report plugin)
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
  private tryParseJSON(output: string): any {
    try {
      return JSON.parse(output);
    } catch {
      // Try extracting JSON from mixed output
      const jsonMatch = output.match(/{[\s\S]*}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Parse JSON output (pytest-json-report plugin)
   */
  private parseJSONOutput(json: any): RalphTestResult {
    const result = this.createEmptyResult();

    // Parse test results
    const tests: TestCase[] = [];

    if (json.tests && Array.isArray(json.tests)) {
      for (const test of json.tests) {
        tests.push(this.parseTestCase(test));
      }
    }

    result.tests = tests;
    result.summary = this.calculateSummary(tests);

    // Extract duration
    if (json.duration !== undefined) {
      result.summary.duration = json.duration;
    }

    return result;
  }

  /**
   * Parse single test case from JSON
   */
  private parseTestCase(test: any): TestCase {
    const status = this.mapStatus(test.outcome || test.call?.outcome);
    const testCase: TestCase = {
      id: test.nodeid || this.generateTestId(test.file || 'unknown', test.name || 'unknown'),
      name: test.name || test.nodeid || 'unknown',
      file: test.file || test.location?.[0] || 'unknown',
      status,
      duration: test.duration || test.call?.duration || 0,
    };

    // Parse line number
    if (test.location && test.location[1]) {
      testCase.line = test.location[1];
    }

    // Parse error if failed
    if (status === 'failed' && test.call) {
      testCase.error = this.parseTestError(test.call);
    }

    return testCase;
  }

  /**
   * Map pytest outcome to ralph status
   */
  private mapStatus(outcome: string): TestCase['status'] {
    const statusMap: Record<string, TestCase['status']> = {
      passed: 'passed',
      failed: 'failed',
      skipped: 'skipped',
      xfailed: 'skipped',
      xpassed: 'passed',
      error: 'error',
    };

    return statusMap[outcome] || 'error';
  }

  /**
   * Parse test error from call info
   */
  private parseTestError(call: any): TestError {
    const error: TestError = {
      message: call.longrepr || call.crash?.message || 'Test failed',
    };

    // Extract stack trace
    if (call.longrepr && typeof call.longrepr === 'string') {
      const lines = call.longrepr.split('\n');
      error.message = lines[0];
      error.stack = lines.slice(1).join('\n');
    }

    return error;
  }

  /**
   * Parse text output (default pytest output)
   */
  private parseTextOutput(output: string): RalphTestResult {
    const result = this.createEmptyResult();
    const tests: TestCase[] = [];
    const lines = output.split('\n');

    let currentFile = 'unknown';
    let inFailureSection = false;
    let currentFailure: { name: string; lines: string[] } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect file name
      const fileMatch = line.match(/^([\w/._-]+\.py)::/);
      if (fileMatch) {
        currentFile = fileMatch[1];
      }

      // Detect test results from short test summary
      const passMatch = line.match(/^([\w/._-]+\.py)::([\w_]+(?:::\w+)*)\s+PASSED/);
      if (passMatch) {
        tests.push({
          id: this.generateTestId(passMatch[1], passMatch[2]),
          name: passMatch[2],
          file: passMatch[1],
          status: 'passed',
          duration: 0,
        });
        continue;
      }

      const failMatch = line.match(/^([\w/._-]+\.py)::([\w_]+(?:::\w+)*)\s+FAILED/);
      if (failMatch) {
        tests.push({
          id: this.generateTestId(failMatch[1], failMatch[2]),
          name: failMatch[2],
          file: failMatch[1],
          status: 'failed',
          duration: 0,
          error: { message: 'Test failed' },
        });
        continue;
      }

      const skipMatch = line.match(/^([\w/._-]+\.py)::([\w_]+(?:::\w+)*)\s+SKIPPED/);
      if (skipMatch) {
        tests.push({
          id: this.generateTestId(skipMatch[1], skipMatch[2]),
          name: skipMatch[2],
          file: skipMatch[1],
          status: 'skipped',
          duration: 0,
        });
        continue;
      }

      // Parse verbose output format
      const verboseMatch = line.match(/^([\w/._-]+\.py)::([\w_]+(?:::\w+)*)\s+(PASSED|FAILED|SKIPPED)\s+\[.*?\](?:\s+(\d+)%)?/);
      if (verboseMatch) {
        const status = verboseMatch[3].toLowerCase();
        tests.push({
          id: this.generateTestId(verboseMatch[1], verboseMatch[2]),
          name: verboseMatch[2],
          file: verboseMatch[1],
          status: this.mapStatus(status),
          duration: 0,
        });
        continue;
      }

      // Detect failure sections
      if (line.includes('FAILURES') || line.includes('ERRORS')) {
        inFailureSection = true;
        continue;
      }

      // Parse failure details
      if (inFailureSection && line.startsWith('_')) {
        // New failure section
        const failureNameMatch = line.match(/_+ (.*?) _+/);
        if (failureNameMatch && currentFailure) {
          // Save previous failure
          this.attachFailureToTest(tests, currentFailure);
        }

        if (failureNameMatch) {
          currentFailure = {
            name: failureNameMatch[1],
            lines: [],
          };
        }
      } else if (currentFailure && line.trim()) {
        currentFailure.lines.push(line);
      }

      // End of failures section
      if (line.includes('=== short test summary')) {
        if (currentFailure) {
          this.attachFailureToTest(tests, currentFailure);
          currentFailure = null;
        }
        inFailureSection = false;
      }
    }

    // Attach last failure if any
    if (currentFailure) {
      this.attachFailureToTest(tests, currentFailure);
    }

    result.tests = tests;
    result.summary = this.calculateSummary(tests);

    // Extract duration from summary
    const durationMatch = output.match(/in\s+(\d+(?:\.\d+)?)\s*s(?:econds)?/);
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
    failure: { name: string; lines: string[] }
  ): void {
    const test = tests.find(t => t.name === failure.name || failure.name.includes(t.name));

    if (test && test.error) {
      test.error.message = failure.lines[0] || test.error.message;
      test.error.stack = failure.lines.join('\n');
    }
  }

  /**
   * Parse coverage from coverage.json (pytest-cov)
   */
  async parseCoverage(coverageFile: string): Promise<CoverageData | null> {
    try {
      const content = await fs.readFile(coverageFile, 'utf-8');
      const json = JSON.parse(content);

      // pytest-cov uses coverage.py format
      return this.parseCoveragePy(json);
    } catch {
      return null;
    }
  }

  /**
   * Parse coverage.py JSON format
   */
  private parseCoveragePy(coverageData: any): CoverageData {
    const files: FileCoverage[] = [];
    let totalLines = 0,
      coveredLines = 0;
    let totalStatements = 0,
      coveredStatements = 0;

    // Process files
    const filesData = coverageData.files || {};

    for (const [filePath, fileData] of Object.entries(filesData)) {
      const data = fileData as any;

      // Lines
      const summary = data.summary || {};
      const numLines = summary.num_statements || 0;
      const covered = summary.covered_lines || 0;
      const missing = summary.missing_lines || 0;

      totalLines += numLines;
      coveredLines += covered;
      totalStatements += numLines;
      coveredStatements += covered;

      files.push({
        path: filePath,
        lines: {
          total: numLines,
          covered,
          percentage: this.calculateCoverage(covered, numLines),
        },
        statements: {
          total: numLines,
          covered,
          percentage: this.calculateCoverage(covered, numLines),
        },
        functions: {
          total: 0,
          covered: 0,
          percentage: 0,
        },
        branches: {
          total: 0,
          covered: 0,
          percentage: 0,
        },
        uncoveredLines: data.missing_lines || [],
      });
    }

    // Overall totals
    const totals = coverageData.totals || {};

    return {
      lines: {
        total: totalLines,
        covered: coveredLines,
        percentage: totals.percent_covered || this.calculateCoverage(coveredLines, totalLines),
      },
      statements: {
        total: totalStatements,
        covered: coveredStatements,
        percentage: totals.percent_covered || this.calculateCoverage(coveredStatements, totalStatements),
      },
      functions: {
        total: 0,
        covered: 0,
        percentage: 0,
      },
      branches: {
        total: 0,
        covered: 0,
        percentage: 0,
      },
      files,
    };
  }
}

// Register parser
parserRegistry.register(new PytestParser());
