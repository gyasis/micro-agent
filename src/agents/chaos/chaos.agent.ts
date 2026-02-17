/**
 * Chaos Agent
 *
 * Adversarial testing agent that generates challenging test cases:
 * - Property-based tests (fast-check)
 * - Mutation testing (Stryker)
 * - Boundary value analysis
 * - Edge case generation
 *
 * Uses high temperature (0.9) for creative adversarial thinking.
 *
 * @module agents/chaos
 */

import { BaseAgent, AgentResult, TokenUsage } from '../base-agent';
import type { AgentContext, ChaosOutput, AdversarialTest } from '../base/agent-context';
import { calculateCost } from '../../llm/cost-calculator';

export interface ChaosTestRequest {
  code: string;
  filePath: string;
  objective: string;
  framework: string;
  existingTests?: string;
}

export interface ChaosTestSuite {
  propertyTests: AdversarialTest[];
  mutationTests: AdversarialTest[];
  boundaryTests: AdversarialTest[];
  edgeCases: string[];
  vulnerabilities: string[];
}

export class ChaosAgent extends BaseAgent {
  /**
   * Execute chaos testing:
   * 1. Analyze code for weaknesses
   * 2. Generate property-based tests
   * 3. Run mutation testing
   * 4. Test boundary values
   * 5. Identify edge cases and vulnerabilities
   */
  protected async onExecute(context: AgentContext): Promise<AgentResult<ChaosOutput>> {
    this.emitProgress('Starting adversarial testing', {
      file: context.artisanCode?.filePath,
    });

    if (!context.artisanCode) {
      throw new Error('No code from Artisan to test');
    }

    // Track token usage across all LLM calls
    let totalTokensUsed = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      // Step 1: Build test request
      const request = this.buildTestRequest(context);
      this.emitProgress('Test request prepared');

      // Step 2: Generate adversarial test suite
      const { testSuite, usage } = await this.generateTestSuite(request);
      if (usage) {
        totalTokensUsed += usage.total;
        totalInputTokens += usage.input;
        totalOutputTokens += usage.output;
      }
      this.emitProgress('Adversarial tests generated', {
        propertyTests: testSuite.propertyTests.length,
        mutationTests: testSuite.mutationTests.length,
        boundaryTests: testSuite.boundaryTests.length,
      });

      // Step 3: Combine all tests
      const allTests = [
        ...testSuite.propertyTests,
        ...testSuite.mutationTests,
        ...testSuite.boundaryTests,
      ];

      // Step 4: Determine if tests passed
      const passed = allTests.every(t => t.passed);
      this.emitProgress(`Chaos testing ${passed ? 'PASSED' : 'FAILED'}`);

      // Calculate cost from token usage
      const cost = calculateCost(this.config.model, totalInputTokens, totalOutputTokens);

      return {
        success: true,
        data: {
          tests: allTests,
          edgeCases: testSuite.edgeCases,
          vulnerabilities: testSuite.vulnerabilities,
          passed,
          tokensUsed: totalTokensUsed,
          cost,
        },
        tokensUsed: totalTokensUsed,
        cost,
        duration: 0,
      };
    } catch (error) {
      this.logger.error('Chaos execution failed', error);
      throw error;
    }
  }

  /**
   * Build chaos test request from context
   */
  private buildTestRequest(context: AgentContext): ChaosTestRequest {
    return {
      code: context.artisanCode!.code,
      filePath: context.artisanCode!.filePath,
      objective: context.objective,
      framework: context.test.framework,
      existingTests: context.test.lastResult?.failures.map(f => f.testName).join(', '),
    };
  }

  /**
   * Generate complete adversarial test suite
   */
  private async generateTestSuite(request: ChaosTestRequest): Promise<{ testSuite: ChaosTestSuite; usage: TokenUsage }> {
    const prompt = this.buildChaosPrompt(request);

    try {
      const response = await this.callLLM(prompt, {
        systemPrompt: CHAOS_SYSTEM_PROMPT,
        temperature: 0.9, // High temp for creative adversarial thinking
        maxTokens: 4000,
      });

      const testSuite = this.parseTestSuite(response.content);
      return { testSuite, usage: response.usage };
    } catch (error) {
      this.logger.error('Test suite generation failed', error);
      throw new Error(`Failed to generate chaos tests: ${error}`);
    }
  }

  /**
   * Build chaos testing prompt
   */
  private buildChaosPrompt(request: ChaosTestRequest): string {
    return `Objective: ${request.objective}

Code to test:
\`\`\`
${request.code}
\`\`\`

Framework: ${request.framework}

${request.existingTests ? `Existing tests: ${request.existingTests}` : ''}

Generate adversarial tests to break this code. Think like an attacker trying to find edge cases, boundary conditions, and unexpected inputs.

Focus on:
1. Property-based tests (invariants that should always hold)
2. Mutation testing ideas (what if we flip conditions, change operators?)
3. Boundary value tests (min/max, zero, negative, overflow)
4. Edge cases that might be missed
5. Security vulnerabilities

Output JSON format:
{
  "propertyTests": [
    {
      "name": "Test name",
      "type": "property",
      "description": "What property to test",
      "passed": true/false
    }
  ],
  "mutationTests": [...],
  "boundaryTests": [...],
  "edgeCases": ["Edge case 1", "Edge case 2"],
  "vulnerabilities": ["Potential vulnerability 1", ...]
}`;
  }

  /**
   * Parse test suite from LLM response
   */
  private parseTestSuite(response: string): ChaosTestSuite {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || response.match(/{[\s\S]*}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const jsonText = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonText);

      return {
        propertyTests: parsed.propertyTests || [],
        mutationTests: parsed.mutationTests || [],
        boundaryTests: parsed.boundaryTests || [],
        edgeCases: parsed.edgeCases || [],
        vulnerabilities: parsed.vulnerabilities || [],
      };
    } catch (error) {
      this.logger.error('Failed to parse test suite', error);
      // Return empty suite on parse failure
      return {
        propertyTests: [],
        mutationTests: [],
        boundaryTests: [],
        edgeCases: [],
        vulnerabilities: [],
      };
    }
  }

  /**
   * Analyze code for weaknesses
   */
  private async analyzeWeaknesses(code: string): Promise<string[]> {
    const weaknesses: string[] = [];

    // Check for common vulnerabilities
    if (code.includes('eval(')) {
      weaknesses.push('Unsafe eval() usage - potential code injection');
    }

    if (/innerHTML\s*=/.test(code)) {
      weaknesses.push('innerHTML assignment - potential XSS vulnerability');
    }

    if (!code.includes('try') && !code.includes('catch')) {
      weaknesses.push('No error handling - may crash on unexpected input');
    }

    if (!/null|undefined/.test(code)) {
      weaknesses.push('No null/undefined checks - may fail on missing data');
    }

    return weaknesses;
  }

  /**
   * Generate edge case suggestions
   */
  private generateEdgeCaseSuggestions(code: string): string[] {
    const edgeCases: string[] = [];

    // Check for array operations
    if (/\[.*\]|\barray\b/i.test(code)) {
      edgeCases.push('Empty array');
      edgeCases.push('Single element array');
      edgeCases.push('Very large array (10000+ elements)');
    }

    // Check for string operations
    if (/string|charAt|substring|indexOf/i.test(code)) {
      edgeCases.push('Empty string');
      edgeCases.push('Very long string (10000+ chars)');
      edgeCases.push('String with special characters (emoji, unicode)');
    }

    // Check for numeric operations
    if (/number|parseInt|parseFloat|\+|\-|\*|\//.test(code)) {
      edgeCases.push('Zero');
      edgeCases.push('Negative numbers');
      edgeCases.push('Very large numbers (Number.MAX_VALUE)');
      edgeCases.push('Very small numbers (Number.MIN_VALUE)');
      edgeCases.push('NaN and Infinity');
    }

    // Check for object operations
    if (/object|\{.*\}/.test(code)) {
      edgeCases.push('Empty object');
      edgeCases.push('Null object');
      edgeCases.push('Object with circular references');
    }

    return edgeCases;
  }

  /**
   * Get chaos testing recommendations
   */
  getRecommendations(output: ChaosOutput): string[] {
    const recommendations: string[] = [];

    if (output.vulnerabilities.length > 0) {
      recommendations.push(
        `Fix ${output.vulnerabilities.length} security vulnerability(ies)`
      );
    }

    if (output.edgeCases.length > 5) {
      recommendations.push(
        `Add handling for ${output.edgeCases.length} identified edge cases`
      );
    }

    const failedTests = output.tests.filter(t => !t.passed);
    if (failedTests.length > 0) {
      recommendations.push(`${failedTests.length} adversarial test(s) failed`);
    }

    return recommendations;
  }
}

const CHAOS_SYSTEM_PROMPT = `You are the Chaos Agent, an adversarial testing expert.

Your role:
- Think like an attacker trying to break code
- Generate challenging test cases that expose weaknesses
- Find edge cases developers might miss
- Identify security vulnerabilities
- Test boundary conditions and unexpected inputs

Testing strategies:
1. Property-based testing: Define invariants that should always hold
2. Mutation testing: What if we flip conditions, change operators?
3. Boundary values: Min/max, zero, negative, overflow, underflow
4. Edge cases: Empty inputs, null, undefined, very large/small values
5. Security: Injection attacks, XSS, buffer overflow, race conditions

Output format:
- Generate specific, executable test ideas
- Include expected behavior and failure conditions
- Prioritize high-impact vulnerabilities
- Be creative and think outside the box

Your tests should be challenging but realistic - focus on real-world failure scenarios.`;
