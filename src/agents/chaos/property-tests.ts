/**
 * Property-Based Test Generator
 *
 * Generates property-based tests using fast-check library.
 * Tests invariants and properties that should always hold true.
 *
 * @module agents/chaos/property-tests
 */

export interface PropertyTest {
  name: string;
  description: string;
  property: string;
  generators: string[];
  expectedInvariant: string;
  code: string;
}

export interface PropertyTestSuite {
  tests: PropertyTest[];
  framework: 'vitest' | 'jest' | 'mocha';
}

/**
 * Property test generator
 */
export class PropertyTestGenerator {
  /**
   * Generate property tests for code
   */
  generateTests(
    code: string,
    framework: 'vitest' | 'jest' | 'mocha' = 'vitest',
  ): PropertyTestSuite {
    const tests: PropertyTest[] = [];

    // Analyze code to identify functions
    const functions = this.extractFunctions(code);

    for (const func of functions) {
      // Generate property tests for each function
      const propertyTests = this.generatePropertyTestsForFunction(func);
      tests.push(...propertyTests);
    }

    return { tests, framework };
  }

  /**
   * Extract functions from code
   */
  private extractFunctions(code: string): Array<{
    name: string;
    params: string[];
    returnType?: string;
  }> {
    const functions: Array<{
      name: string;
      params: string[];
      returnType?: string;
    }> = [];

    // Match function declarations
    const functionRegex =
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?::\s*(\w+))?/g;
    let match;

    while ((match = functionRegex.exec(code)) !== null) {
      const name = match[1];
      const paramsStr = match[2];
      const returnType = match[3];

      const params = paramsStr
        .split(',')
        .map((p) => p.trim().split(':')[0].trim())
        .filter(Boolean);

      functions.push({ name, params, returnType });
    }

    // Match arrow functions
    const arrowRegex =
      /(?:export\s+)?const\s+(\w+)\s*=\s*\(([^)]*)\)(?::\s*(\w+))?\s*=>/g;

    while ((match = arrowRegex.exec(code)) !== null) {
      const name = match[1];
      const paramsStr = match[2];
      const returnType = match[3];

      const params = paramsStr
        .split(',')
        .map((p) => p.trim().split(':')[0].trim())
        .filter(Boolean);

      functions.push({ name, params, returnType });
    }

    return functions;
  }

  /**
   * Generate property tests for a function
   */
  private generatePropertyTestsForFunction(func: {
    name: string;
    params: string[];
    returnType?: string;
  }): PropertyTest[] {
    const tests: PropertyTest[] = [];

    // Test 1: Output type consistency
    if (func.returnType) {
      tests.push({
        name: `${func.name} - output type consistency`,
        description: `${func.name} should always return ${func.returnType}`,
        property: 'type_consistency',
        generators: func.params.map((p) => this.inferGenerator(p)),
        expectedInvariant: `typeof result === '${this.inferJSType(func.returnType)}'`,
        code: this.generateTypeConsistencyTest(func),
      });
    }

    // Test 2: No exceptions on valid input
    tests.push({
      name: `${func.name} - no exceptions`,
      description: `${func.name} should not throw on valid inputs`,
      property: 'no_exceptions',
      generators: func.params.map((p) => this.inferGenerator(p)),
      expectedInvariant: 'No exceptions thrown',
      code: this.generateNoExceptionsTest(func),
    });

    // Test 3: Deterministic output (if pure function)
    if (this.isPureFunction(func.name)) {
      tests.push({
        name: `${func.name} - deterministic`,
        description: `${func.name} should return same output for same input`,
        property: 'deterministic',
        generators: func.params.map((p) => this.inferGenerator(p)),
        expectedInvariant: 'result1 === result2',
        code: this.generateDeterministicTest(func),
      });
    }

    return tests;
  }

  /**
   * Infer fast-check generator from parameter name
   */
  private inferGenerator(paramName: string): string {
    const lower = paramName.toLowerCase();

    // String generators
    if (
      lower.includes('name') ||
      lower.includes('str') ||
      lower.includes('text')
    ) {
      return 'fc.string()';
    }

    // Number generators
    if (
      lower.includes('num') ||
      lower.includes('count') ||
      lower.includes('index') ||
      lower.includes('id')
    ) {
      return 'fc.integer()';
    }

    // Array generators
    if (
      lower.includes('arr') ||
      lower.includes('list') ||
      lower.includes('items')
    ) {
      return 'fc.array(fc.anything())';
    }

    // Boolean generators
    if (
      lower.includes('is') ||
      lower.includes('has') ||
      lower.includes('flag')
    ) {
      return 'fc.boolean()';
    }

    // Default: anything
    return 'fc.anything()';
  }

  /**
   * Infer JavaScript type from TypeScript type
   */
  private inferJSType(tsType: string): string {
    const typeMap: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      void: 'undefined',
      any: 'object',
      unknown: 'object',
    };

    return typeMap[tsType.toLowerCase()] || 'object';
  }

  /**
   * Check if function is likely pure
   */
  private isPureFunction(name: string): boolean {
    const lower = name.toLowerCase();

    // Pure function indicators
    return (
      lower.startsWith('get') ||
      lower.startsWith('calc') ||
      lower.startsWith('compute') ||
      lower.startsWith('is') ||
      lower.startsWith('has')
    );
  }

  /**
   * Generate type consistency test code
   */
  private generateTypeConsistencyTest(func: {
    name: string;
    params: string[];
    returnType?: string;
  }): string {
    const generators = func.params
      .map((p, i) => this.inferGenerator(p))
      .join(', ');
    const paramsList = func.params.join(', ');

    return `import * as fc from 'fast-check';
import { ${func.name} } from './module';

test('${func.name} - type consistency', () => {
  fc.assert(
    fc.property(${generators}, (${paramsList}) => {
      const result = ${func.name}(${paramsList});
      return typeof result === '${this.inferJSType(func.returnType!)}';
    })
  );
});`;
  }

  /**
   * Generate no exceptions test code
   */
  private generateNoExceptionsTest(func: {
    name: string;
    params: string[];
  }): string {
    const generators = func.params
      .map((p, i) => this.inferGenerator(p))
      .join(', ');
    const paramsList = func.params.join(', ');

    return `import * as fc from 'fast-check';
import { ${func.name} } from './module';

test('${func.name} - no exceptions', () => {
  fc.assert(
    fc.property(${generators}, (${paramsList}) => {
      try {
        ${func.name}(${paramsList});
        return true;
      } catch (error) {
        return false;
      }
    })
  );
});`;
  }

  /**
   * Generate deterministic test code
   */
  private generateDeterministicTest(func: {
    name: string;
    params: string[];
  }): string {
    const generators = func.params
      .map((p, i) => this.inferGenerator(p))
      .join(', ');
    const paramsList = func.params.join(', ');

    return `import * as fc from 'fast-check';
import { ${func.name} } from './module';

test('${func.name} - deterministic', () => {
  fc.assert(
    fc.property(${generators}, (${paramsList}) => {
      const result1 = ${func.name}(${paramsList});
      const result2 = ${func.name}(${paramsList});
      return JSON.stringify(result1) === JSON.stringify(result2);
    })
  );
});`;
  }

  /**
   * Generate complete test file
   */
  generateTestFile(suite: PropertyTestSuite, modulePath: string): string {
    const imports =
      suite.framework === 'vitest'
        ? `import { test } from 'vitest';`
        : `import { test } from '@jest/globals';`;

    const tests = suite.tests.map((t) => t.code).join('\n\n');

    return `${imports}
import * as fc from 'fast-check';

${tests}`;
  }

  /**
   * Get common property patterns
   */
  getCommonProperties(): Array<{
    name: string;
    description: string;
    example: string;
  }> {
    return [
      {
        name: 'Idempotence',
        description: 'f(f(x)) === f(x)',
        example: 'fc.assert(fc.property(fc.anything(), x => f(f(x)) === f(x)))',
      },
      {
        name: 'Commutativity',
        description: 'f(a, b) === f(b, a)',
        example:
          'fc.assert(fc.property(fc.anything(), fc.anything(), (a, b) => f(a, b) === f(b, a)))',
      },
      {
        name: 'Associativity',
        description: 'f(f(a, b), c) === f(a, f(b, c))',
        example:
          'fc.assert(fc.property(fc.anything(), fc.anything(), fc.anything(), (a, b, c) => f(f(a, b), c) === f(a, f(b, c))))',
      },
      {
        name: 'Identity',
        description: 'f(x, identity) === x',
        example:
          'fc.assert(fc.property(fc.anything(), x => f(x, identity) === x))',
      },
      {
        name: 'Inverse',
        description: 'f(g(x)) === x',
        example: 'fc.assert(fc.property(fc.anything(), x => f(g(x)) === x))',
      },
    ];
  }
}
