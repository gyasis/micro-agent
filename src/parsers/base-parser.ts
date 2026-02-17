/**
 * Base Parser Interface
 *
 * Defines the ralph-test-json unified schema for test results across all frameworks.
 * All language-specific parsers implement this interface to provide consistent output.
 *
 * @module parsers/base-parser
 */

import type { TestFramework } from './framework-detector';

/**
 * Ralph Test JSON Schema
 * Unified format for test results across all frameworks
 */
export interface RalphTestResult {
  framework: TestFramework;
  version: string;
  timestamp: string;
  summary: TestSummary;
  tests: TestCase[];
  coverage?: CoverageData;
  metadata?: TestMetadata;
}

/**
 * Test execution summary
 */
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  status: 'passed' | 'failed' | 'error';
}

/**
 * Individual test case
 */
export interface TestCase {
  id: string;
  name: string;
  file: string;
  line?: number;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  error?: TestError;
  assertions?: TestAssertion[];
}

/**
 * Test error information
 */
export interface TestError {
  message: string;
  stack?: string;
  expected?: any;
  actual?: any;
  diff?: string;
  location?: ErrorLocation;
}

/**
 * Error location
 */
export interface ErrorLocation {
  file: string;
  line: number;
  column?: number;
}

/**
 * Test assertion
 */
export interface TestAssertion {
  description: string;
  passed: boolean;
  expected?: any;
  actual?: any;
}

/**
 * Coverage data
 */
export interface CoverageData {
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
  files?: FileCoverage[];
}

/**
 * Coverage metric
 */
export interface CoverageMetric {
  total: number;
  covered: number;
  percentage: number;
}

/**
 * File-level coverage
 */
export interface FileCoverage {
  path: string;
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
  uncoveredLines?: number[];
}

/**
 * Test metadata
 */
export interface TestMetadata {
  command: string;
  workingDirectory: string;
  environment?: Record<string, string>;
  config?: string;
  [key: string]: any;
}

/**
 * Base Test Parser Interface
 * All framework-specific parsers must implement this
 */
export interface TestParser {
  /**
   * Framework this parser handles
   */
  readonly framework: TestFramework;

  /**
   * Parse raw test output to RalphTestResult
   */
  parse(output: string): Promise<RalphTestResult>;

  /**
   * Parse coverage data (optional, may return null)
   */
  parseCoverage?(coverageFile: string): Promise<CoverageData | null>;

  /**
   * Validate parsed result
   */
  validate(result: RalphTestResult): boolean;
}

/**
 * Abstract base parser implementation
 */
export abstract class BaseTestParser implements TestParser {
  abstract readonly framework: TestFramework;

  abstract parse(output: string): Promise<RalphTestResult>;

  /**
   * Default coverage parsing (can be overridden)
   */
  async parseCoverage(coverageFile: string): Promise<CoverageData | null> {
    return null; // Default: no coverage
  }

  /**
   * Validate parsed result against schema
   */
  validate(result: RalphTestResult): boolean {
    try {
      // Check required fields
      if (!result.framework) return false;
      if (!result.timestamp) return false;
      if (!result.summary) return false;
      if (!Array.isArray(result.tests)) return false;

      // Validate summary
      const summary = result.summary;
      if (typeof summary.total !== 'number') return false;
      if (typeof summary.passed !== 'number') return false;
      if (typeof summary.failed !== 'number') return false;
      if (typeof summary.skipped !== 'number') return false;
      if (typeof summary.duration !== 'number') return false;

      // Validate totals match
      const calculatedTotal = summary.passed + summary.failed + summary.skipped;
      if (calculatedTotal !== summary.total) return false;

      // Validate test cases
      for (const test of result.tests) {
        if (!test.id || !test.name || !test.file) return false;
        if (!['passed', 'failed', 'skipped', 'error'].includes(test.status)) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create empty result template
   */
  protected createEmptyResult(): RalphTestResult {
    return {
      framework: this.framework,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        status: 'error',
      },
      tests: [],
    };
  }

  /**
   * Calculate summary from test cases
   */
  protected calculateSummary(tests: TestCase[]): TestSummary {
    const passed = tests.filter(t => t.status === 'passed').length;
    const failed = tests.filter(t => t.status === 'failed' || t.status === 'error').length;
    const skipped = tests.filter(t => t.status === 'skipped').length;
    const duration = tests.reduce((sum, t) => sum + t.duration, 0);

    return {
      total: tests.length,
      passed,
      failed,
      skipped,
      duration,
      status: failed > 0 ? 'failed' : 'passed',
    };
  }

  /**
   * Calculate coverage percentage
   */
  protected calculateCoverage(covered: number, total: number): number {
    return total > 0 ? (covered / total) * 100 : 0;
  }

  /**
   * Generate unique test ID
   */
  protected generateTestId(file: string, name: string): string {
    return `${file}::${name}`.replace(/\s+/g, '_');
  }
}

/**
 * Parser registry for all frameworks
 */
export class ParserRegistry {
  private parsers = new Map<TestFramework, TestParser>();

  /**
   * Register a parser for a framework
   */
  register(parser: TestParser): void {
    this.parsers.set(parser.framework, parser);
  }

  /**
   * Get parser for framework
   */
  get(framework: TestFramework): TestParser | undefined {
    return this.parsers.get(framework);
  }

  /**
   * Check if framework is supported
   */
  supports(framework: TestFramework): boolean {
    return this.parsers.has(framework);
  }

  /**
   * Get all supported frameworks
   */
  getSupportedFrameworks(): TestFramework[] {
    return Array.from(this.parsers.keys());
  }
}

/**
 * Global parser registry
 */
export const parserRegistry = new ParserRegistry();
