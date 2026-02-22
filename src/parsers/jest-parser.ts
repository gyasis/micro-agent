/**
 * Jest/Vitest Parser
 *
 * Parses Jest and Vitest test output to ralph-test-json format.
 * Supports both frameworks due to their similar output structures.
 *
 * @module parsers/jest-parser
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

export class JestParser extends BaseTestParser {
  readonly framework: TestFramework = 'jest';

  /**
   * Parse Jest/Vitest JSON output
   */
  async parse(output: string): Promise<RalphTestResult> {
    const result = this.createEmptyResult();

    try {
      // Try parsing as JSON (--json flag)
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
   * Parse JSON output format
   */
  private parseJSONOutput(json: any): RalphTestResult {
    const result = this.createEmptyResult();

    // Parse test results
    const testResults = json.testResults || [];
    const tests: TestCase[] = [];

    for (const testFile of testResults) {
      const filePath = testFile.name || testFile.testFilePath || 'unknown';

      for (const assertion of testFile.assertionResults || []) {
        tests.push(this.parseAssertion(assertion, filePath));
      }
    }

    result.tests = tests;
    result.summary = this.calculateSummary(tests);

    // Extract duration from JSON
    if (json.testResults?.[0]?.perfStats) {
      result.summary.duration =
        json.testResults.reduce(
          (sum: number, tr: any) => sum + (tr.perfStats?.runtime || 0),
          0,
        ) / 1000; // Convert to seconds
    }

    return result;
  }

  /**
   * Parse single assertion
   */
  private parseAssertion(assertion: any, filePath: string): TestCase {
    const status = this.mapStatus(assertion.status);
    const testCase: TestCase = {
      id: this.generateTestId(filePath, assertion.fullName || assertion.title),
      name: assertion.fullName || assertion.title || 'unknown',
      file: filePath,
      status,
      duration: (assertion.duration || 0) / 1000,
    };

    // Parse error if failed
    if (status === 'failed' && assertion.failureMessages) {
      testCase.error = this.parseError(assertion.failureMessages);
    }

    // Parse location
    if (assertion.location) {
      testCase.line = assertion.location.line;
    }

    return testCase;
  }

  /**
   * Map Jest status to ralph status
   */
  private mapStatus(status: string): TestCase['status'] {
    const statusMap: Record<string, TestCase['status']> = {
      passed: 'passed',
      failed: 'failed',
      pending: 'skipped',
      skipped: 'skipped',
      todo: 'skipped',
      disabled: 'skipped',
    };

    return statusMap[status] || 'error';
  }

  /**
   * Parse error from failure messages
   */
  private parseError(failureMessages: string[]): TestError {
    const message = failureMessages[0] || 'Unknown error';

    // Extract stack trace
    const stackMatch = message.match(/\s+at .*/g);
    const stack = stackMatch ? stackMatch.join('\n') : undefined;

    // Extract expected/actual (if present)
    const expectedMatch = message.match(/Expected:\s*(.+)/);
    const actualMatch = message.match(/Received:\s*(.+)/);

    return {
      message: message.split('\n')[0],
      stack,
      expected: expectedMatch ? expectedMatch[1] : undefined,
      actual: actualMatch ? actualMatch[1] : undefined,
    };
  }

  /**
   * Parse text output (fallback)
   */
  private parseTextOutput(output: string): RalphTestResult {
    const result = this.createEmptyResult();
    const tests: TestCase[] = [];

    // Parse test results from text
    const lines = output.split('\n');
    let currentFile = 'unknown';

    for (const line of lines) {
      // Detect file name
      const fileMatch = line.match(/\s+([\w/.-]+\.(?:test|spec)\.[jt]sx?)/);
      if (fileMatch) {
        currentFile = fileMatch[1];
      }

      // Detect test results
      const passMatch = line.match(/✓\s+(.+?)\s+\((\d+)(?:ms|s)\)/);
      if (passMatch) {
        tests.push({
          id: this.generateTestId(currentFile, passMatch[1]),
          name: passMatch[1],
          file: currentFile,
          status: 'passed',
          duration: parseInt(passMatch[2], 10) / 1000,
        });
      }

      const failMatch = line.match(/✕\s+(.+)/);
      if (failMatch) {
        tests.push({
          id: this.generateTestId(currentFile, failMatch[1]),
          name: failMatch[1],
          file: currentFile,
          status: 'failed',
          duration: 0,
          error: { message: 'Test failed' },
        });
      }

      const skipMatch = line.match(/○\s+(.+)/);
      if (skipMatch) {
        tests.push({
          id: this.generateTestId(currentFile, skipMatch[1]),
          name: skipMatch[1],
          file: currentFile,
          status: 'skipped',
          duration: 0,
        });
      }
    }

    result.tests = tests;
    result.summary = this.calculateSummary(tests);

    // Extract duration from summary line
    const durationMatch = output.match(/Time:\s+(\d+(?:\.\d+)?)\s*s/);
    if (durationMatch) {
      result.summary.duration = parseFloat(durationMatch[1]);
    }

    return result;
  }

  /**
   * Parse coverage from JSON file
   */
  async parseCoverage(coverageFile: string): Promise<CoverageData | null> {
    try {
      const content = await fs.readFile(coverageFile, 'utf-8');
      const json = JSON.parse(content);

      // Jest coverage-final.json format
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        return this.parseJestCoverage(json);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse Jest coverage format
   */
  private parseJestCoverage(coverageData: any): CoverageData {
    const files: FileCoverage[] = [];
    let totalLines = 0,
      coveredLines = 0;
    let totalStatements = 0,
      coveredStatements = 0;
    let totalFunctions = 0,
      coveredFunctions = 0;
    let totalBranches = 0,
      coveredBranches = 0;

    // Process each file
    for (const [filePath, fileCoverage] of Object.entries(coverageData)) {
      const fc = fileCoverage as any;

      // Lines
      const linesCov = this.processCoverageMap(fc.s, fc.statementMap);
      totalLines += linesCov.total;
      coveredLines += linesCov.covered;

      // Statements
      const statementsCov = this.processCoverageMap(fc.s, fc.statementMap);
      totalStatements += statementsCov.total;
      coveredStatements += statementsCov.covered;

      // Functions
      const functionsCov = this.processCoverageMap(fc.f, fc.fnMap);
      totalFunctions += functionsCov.total;
      coveredFunctions += functionsCov.covered;

      // Branches
      const branchesCov = this.processCoverageMap(fc.b, fc.branchMap);
      totalBranches += branchesCov.total;
      coveredBranches += branchesCov.covered;

      // File coverage
      files.push({
        path: filePath,
        lines: linesCov,
        statements: statementsCov,
        functions: functionsCov,
        branches: branchesCov,
        uncoveredLines: this.getUncoveredLines(fc.s, fc.statementMap),
      });
    }

    return {
      lines: {
        total: totalLines,
        covered: coveredLines,
        percentage: this.calculateCoverage(coveredLines, totalLines),
      },
      statements: {
        total: totalStatements,
        covered: coveredStatements,
        percentage: this.calculateCoverage(coveredStatements, totalStatements),
      },
      functions: {
        total: totalFunctions,
        covered: coveredFunctions,
        percentage: this.calculateCoverage(coveredFunctions, totalFunctions),
      },
      branches: {
        total: totalBranches,
        covered: coveredBranches,
        percentage: this.calculateCoverage(coveredBranches, totalBranches),
      },
      files,
    };
  }

  /**
   * Process coverage map
   */
  private processCoverageMap(
    hits: Record<string, number>,
    map: Record<string, any>,
  ): { total: number; covered: number; percentage: number } {
    const total = Object.keys(hits).length;
    const covered = Object.values(hits).filter((h) => h > 0).length;

    return {
      total,
      covered,
      percentage: this.calculateCoverage(covered, total),
    };
  }

  /**
   * Get uncovered line numbers
   */
  private getUncoveredLines(
    hits: Record<string, number>,
    statementMap: Record<string, any>,
  ): number[] {
    const uncovered: number[] = [];

    for (const [key, count] of Object.entries(hits)) {
      if (count === 0 && statementMap[key]?.start?.line) {
        uncovered.push(statementMap[key].start.line);
      }
    }

    return uncovered.sort((a, b) => a - b);
  }
}

/**
 * Vitest Parser (extends Jest parser due to similarity)
 */
export class VitestParser extends JestParser {
  readonly framework: TestFramework = 'vitest';
}

// Register parsers
parserRegistry.register(new JestParser());
parserRegistry.register(new VitestParser());
