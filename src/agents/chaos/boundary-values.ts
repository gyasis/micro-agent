/**
 * Boundary Value Analysis and Fuzzing
 *
 * Generates boundary value test cases for adversarial testing.
 * Tests min/max values, zero, negative, overflow, underflow, and edge cases.
 *
 * @module agents/chaos/boundary-values
 */

export interface BoundaryValue {
  type: BoundaryType;
  value: any;
  description: string;
  language: 'typescript' | 'python' | 'rust';
}

export type BoundaryType =
  | 'min'
  | 'max'
  | 'zero'
  | 'negative'
  | 'overflow'
  | 'underflow'
  | 'empty'
  | 'null'
  | 'undefined'
  | 'special';

export interface BoundaryTestCase {
  name: string;
  input: BoundaryValue[];
  expectedBehavior: string;
  testCode: string;
}

export interface TypeInfo {
  name: string;
  isNumeric: boolean;
  isString: boolean;
  isArray: boolean;
  isObject: boolean;
  isOptional: boolean;
}

/**
 * Boundary value fuzzer
 */
export class BoundaryValueFuzzer {
  /**
   * Generate boundary test cases for function parameters
   */
  generateBoundaryTests(
    funcName: string,
    params: Array<{ name: string; type: string }>,
    language: 'typescript' | 'python' | 'rust' = 'typescript'
  ): BoundaryTestCase[] {
    const tests: BoundaryTestCase[] = [];

    for (const param of params) {
      const typeInfo = this.parseType(param.type);
      const boundaries = this.getBoundariesForType(typeInfo, language);

      for (const boundary of boundaries) {
        tests.push(
          this.createTestCase(funcName, param.name, boundary, language)
        );
      }
    }

    return tests;
  }

  /**
   * Parse type string to extract type information
   */
  private parseType(typeStr: string): TypeInfo {
    const normalized = typeStr.toLowerCase().trim();

    return {
      name: typeStr,
      isNumeric:
        /number|int|float|double|i32|i64|u32|u64|f32|f64/.test(normalized),
      isString: /string|str/.test(normalized),
      isArray: /array|list|vec/.test(normalized) || typeStr.includes('[]'),
      isObject: /object|dict|struct/.test(normalized) || typeStr.includes('{'),
      isOptional:
        typeStr.includes('?') ||
        typeStr.includes('Option') ||
        typeStr.includes('Optional'),
    };
  }

  /**
   * Get boundary values for a type
   */
  private getBoundariesForType(
    type: TypeInfo,
    language: 'typescript' | 'python' | 'rust'
  ): BoundaryValue[] {
    const boundaries: BoundaryValue[] = [];

    if (type.isNumeric) {
      boundaries.push(...this.getNumericBoundaries(type.name, language));
    }

    if (type.isString) {
      boundaries.push(...this.getStringBoundaries(language));
    }

    if (type.isArray) {
      boundaries.push(...this.getArrayBoundaries(language));
    }

    if (type.isObject) {
      boundaries.push(...this.getObjectBoundaries(language));
    }

    if (type.isOptional) {
      boundaries.push(...this.getNullBoundaries(language));
    }

    return boundaries;
  }

  /**
   * Get numeric boundary values
   */
  private getNumericBoundaries(
    typeName: string,
    language: 'typescript' | 'python' | 'rust'
  ): BoundaryValue[] {
    const boundaries: BoundaryValue[] = [];

    // Language-specific numeric limits
    const limits = this.getNumericLimits(typeName, language);

    boundaries.push(
      {
        type: 'zero',
        value: 0,
        description: 'Zero value',
        language,
      },
      {
        type: 'negative',
        value: -1,
        description: 'Negative value',
        language,
      },
      {
        type: 'min',
        value: limits.min,
        description: `Minimum ${typeName} value`,
        language,
      },
      {
        type: 'max',
        value: limits.max,
        description: `Maximum ${typeName} value`,
        language,
      },
      {
        type: 'overflow',
        value: limits.overflow,
        description: `Overflow ${typeName} value`,
        language,
      },
      {
        type: 'underflow',
        value: limits.underflow,
        description: `Underflow ${typeName} value`,
        language,
      }
    );

    // Special numeric values
    if (language === 'typescript' || language === 'python') {
      boundaries.push(
        {
          type: 'special',
          value: language === 'typescript' ? 'NaN' : 'float("nan")',
          description: 'Not a Number',
          language,
        },
        {
          type: 'special',
          value: language === 'typescript' ? 'Infinity' : 'float("inf")',
          description: 'Positive Infinity',
          language,
        },
        {
          type: 'special',
          value: language === 'typescript' ? '-Infinity' : 'float("-inf")',
          description: 'Negative Infinity',
          language,
        }
      );
    }

    return boundaries;
  }

  /**
   * Get numeric limits for a type
   */
  private getNumericLimits(
    typeName: string,
    language: 'typescript' | 'python' | 'rust'
  ): {
    min: string | number;
    max: string | number;
    overflow: string | number;
    underflow: string | number;
  } {
    const normalized = typeName.toLowerCase();

    // TypeScript/JavaScript
    if (language === 'typescript') {
      if (normalized.includes('int') || normalized === 'number') {
        return {
          min: 'Number.MIN_SAFE_INTEGER',
          max: 'Number.MAX_SAFE_INTEGER',
          overflow: 'Number.MAX_SAFE_INTEGER + 1',
          underflow: 'Number.MIN_SAFE_INTEGER - 1',
        };
      }
      return {
        min: 'Number.MIN_VALUE',
        max: 'Number.MAX_VALUE',
        overflow: 'Number.MAX_VALUE * 2',
        underflow: 'Number.MIN_VALUE / 2',
      };
    }

    // Python
    if (language === 'python') {
      if (normalized.includes('int')) {
        return {
          min: '-2**63',
          max: '2**63 - 1',
          overflow: '2**63',
          underflow: '-(2**63 + 1)',
        };
      }
      return {
        min: 'float("-inf")',
        max: 'float("inf")',
        overflow: 'float("inf")',
        underflow: 'float("-inf")',
      };
    }

    // Rust
    if (language === 'rust') {
      if (normalized.includes('i32')) {
        return {
          min: 'i32::MIN',
          max: 'i32::MAX',
          overflow: 'i32::MAX.wrapping_add(1)',
          underflow: 'i32::MIN.wrapping_sub(1)',
        };
      }
      if (normalized.includes('i64')) {
        return {
          min: 'i64::MIN',
          max: 'i64::MAX',
          overflow: 'i64::MAX.wrapping_add(1)',
          underflow: 'i64::MIN.wrapping_sub(1)',
        };
      }
      if (normalized.includes('u32')) {
        return {
          min: 'u32::MIN',
          max: 'u32::MAX',
          overflow: 'u32::MAX.wrapping_add(1)',
          underflow: 0,
        };
      }
      if (normalized.includes('f32')) {
        return {
          min: 'f32::MIN',
          max: 'f32::MAX',
          overflow: 'f32::INFINITY',
          underflow: 'f32::NEG_INFINITY',
        };
      }
    }

    // Default
    return {
      min: -1000000,
      max: 1000000,
      overflow: 1000001,
      underflow: -1000001,
    };
  }

  /**
   * Get string boundary values
   */
  private getStringBoundaries(
    language: 'typescript' | 'python' | 'rust'
  ): BoundaryValue[] {
    return [
      {
        type: 'empty',
        value: '""',
        description: 'Empty string',
        language,
      },
      {
        type: 'min',
        value: '"a"',
        description: 'Single character',
        language,
      },
      {
        type: 'max',
        value: '"a".repeat(10000)',
        description: 'Very long string (10000 chars)',
        language,
      },
      {
        type: 'special',
        value: language === 'rust' ? '"\\u{1F600}"' : '"😀🎉"',
        description: 'Unicode/emoji characters',
        language,
      },
      {
        type: 'special',
        value: '"\\n\\t\\r"',
        description: 'Whitespace characters',
        language,
      },
      {
        type: 'special',
        value: '"\'; DROP TABLE users; --"',
        description: 'SQL injection attempt',
        language,
      },
      {
        type: 'special',
        value: '"<script>alert(1)</script>"',
        description: 'XSS attempt',
        language,
      },
    ];
  }

  /**
   * Get array boundary values
   */
  private getArrayBoundaries(
    language: 'typescript' | 'python' | 'rust'
  ): BoundaryValue[] {
    const empty =
      language === 'rust'
        ? 'vec![]'
        : language === 'python'
          ? '[]'
          : '[]';
    const single =
      language === 'rust'
        ? 'vec![1]'
        : language === 'python'
          ? '[1]'
          : '[1]';
    const large =
      language === 'rust'
        ? 'vec![1; 10000]'
        : language === 'python'
          ? '[1] * 10000'
          : 'Array(10000).fill(1)';

    return [
      {
        type: 'empty',
        value: empty,
        description: 'Empty array',
        language,
      },
      {
        type: 'min',
        value: single,
        description: 'Single element',
        language,
      },
      {
        type: 'max',
        value: large,
        description: 'Very large array (10000 elements)',
        language,
      },
    ];
  }

  /**
   * Get object boundary values
   */
  private getObjectBoundaries(
    language: 'typescript' | 'python' | 'rust'
  ): BoundaryValue[] {
    const boundaries: BoundaryValue[] = [
      {
        type: 'empty',
        value: language === 'python' ? '{}' : '{}',
        description: 'Empty object',
        language,
      },
    ];

    if (language !== 'rust') {
      // Circular reference only for dynamic languages
      boundaries.push({
        type: 'special',
        value:
          language === 'typescript'
            ? '(() => { const o: any = {}; o.self = o; return o; })()'
            : 'lambda: (lambda o: o.__setitem__("self", o) or o)({})',
        description: 'Object with circular reference',
        language,
      });
    }

    return boundaries;
  }

  /**
   * Get null/undefined boundary values
   */
  private getNullBoundaries(
    language: 'typescript' | 'python' | 'rust'
  ): BoundaryValue[] {
    const boundaries: BoundaryValue[] = [];

    if (language === 'typescript') {
      boundaries.push(
        {
          type: 'null',
          value: 'null',
          description: 'Null value',
          language,
        },
        {
          type: 'undefined',
          value: 'undefined',
          description: 'Undefined value',
          language,
        }
      );
    } else if (language === 'python') {
      boundaries.push({
        type: 'null',
        value: 'None',
        description: 'None value',
        language,
      });
    } else if (language === 'rust') {
      boundaries.push({
        type: 'null',
        value: 'None',
        description: 'Option::None value',
        language,
      });
    }

    return boundaries;
  }

  /**
   * Create test case for a boundary value
   */
  private createTestCase(
    funcName: string,
    paramName: string,
    boundary: BoundaryValue,
    language: 'typescript' | 'python' | 'rust'
  ): BoundaryTestCase {
    const testName = `${funcName} - ${paramName} ${boundary.type} (${boundary.description})`;

    return {
      name: testName,
      input: [boundary],
      expectedBehavior: this.getExpectedBehavior(boundary.type),
      testCode: this.generateTestCode(funcName, paramName, boundary, language),
    };
  }

  /**
   * Get expected behavior for boundary type
   */
  private getExpectedBehavior(type: BoundaryType): string {
    const behaviors: Record<BoundaryType, string> = {
      min: 'Should handle minimum value without error or overflow',
      max: 'Should handle maximum value without error or overflow',
      zero: 'Should handle zero value correctly (avoid division by zero)',
      negative: 'Should handle negative values if supported, or reject gracefully',
      overflow: 'Should detect overflow or clamp to max value',
      underflow: 'Should detect underflow or clamp to min value',
      empty: 'Should handle empty input gracefully',
      null: 'Should handle null/None/undefined without crashing',
      undefined: 'Should handle undefined without crashing',
      special: 'Should handle special values (NaN, Infinity, unicode) correctly',
    };

    return behaviors[type];
  }

  /**
   * Generate test code for boundary value
   */
  private generateTestCode(
    funcName: string,
    paramName: string,
    boundary: BoundaryValue,
    language: 'typescript' | 'python' | 'rust'
  ): string {
    if (language === 'typescript') {
      return this.generateTypeScriptTest(funcName, paramName, boundary);
    } else if (language === 'python') {
      return this.generatePythonTest(funcName, paramName, boundary);
    } else {
      return this.generateRustTest(funcName, paramName, boundary);
    }
  }

  /**
   * Generate TypeScript test code
   */
  private generateTypeScriptTest(
    funcName: string,
    paramName: string,
    boundary: BoundaryValue
  ): string {
    return `test('${funcName} - ${boundary.description}', () => {
  const ${paramName} = ${boundary.value};

  // Test should either succeed or throw appropriate error
  try {
    const result = ${funcName}(${paramName});
    expect(result).toBeDefined();
  } catch (error) {
    // Error should be descriptive and expected
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBeTruthy();
  }
});`;
  }

  /**
   * Generate Python test code
   */
  private generatePythonTest(
    funcName: string,
    paramName: string,
    boundary: BoundaryValue
  ): string {
    return `def test_${funcName}_${boundary.type}():
    """Test ${funcName} with ${boundary.description}"""
    ${paramName} = ${boundary.value}

    try:
        result = ${funcName}(${paramName})
        assert result is not None
    except (ValueError, TypeError, OverflowError) as e:
        # Expected error for boundary value
        assert str(e)`;
  }

  /**
   * Generate Rust test code
   */
  private generateRustTest(
    funcName: string,
    paramName: string,
    boundary: BoundaryValue
  ): string {
    return `#[test]
fn test_${funcName}_${boundary.type}() {
    let ${paramName} = ${boundary.value};

    // Test should compile and run
    let result = ${funcName}(${paramName});

    // Result should be valid or error should be handled
    match result {
        Ok(_) => {},
        Err(e) => {
            assert!(!e.to_string().is_empty());
        }
    }
}`;
  }

  /**
   * Generate fuzzing strategy for function
   */
  generateFuzzingStrategy(
    funcName: string,
    params: Array<{ name: string; type: string }>,
    language: 'typescript' | 'python' | 'rust'
  ): string {
    const lines: string[] = [];

    lines.push(`# Fuzzing Strategy for ${funcName}`);
    lines.push('');
    lines.push('## Boundary Test Coverage');
    lines.push('');

    for (const param of params) {
      const typeInfo = this.parseType(param.type);
      const boundaries = this.getBoundariesForType(typeInfo, language);

      lines.push(`### Parameter: ${param.name} (${param.type})`);
      lines.push('');

      for (const boundary of boundaries) {
        lines.push(`- **${boundary.type}**: ${boundary.description}`);
        lines.push(`  - Value: \`${boundary.value}\``);
        lines.push(`  - Expected: ${this.getExpectedBehavior(boundary.type)}`);
      }

      lines.push('');
    }

    lines.push('## Recommended Approach');
    lines.push('');
    lines.push('1. Test each boundary value independently');
    lines.push('2. Test combinations of boundary values');
    lines.push('3. Verify error messages are descriptive');
    lines.push('4. Check for resource leaks on error paths');
    lines.push('5. Validate security implications (injection, overflow)');

    return lines.join('\n');
  }
}
