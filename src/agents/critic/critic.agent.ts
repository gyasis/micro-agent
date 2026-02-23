/**
 * Critic Agent
 *
 * Logic reviewer using GPT-4.1-mini for analyzing generated code.
 * Focuses on correctness, edge cases, and potential bugs.
 *
 * @module agents/critic
 */

import { BaseAgent, AgentResult, TokenUsage } from '../base-agent';
import type {
  AgentContext,
  CriticOutput,
  ReviewIssue,
} from '../base/agent-context';
import { calculateCost } from '../../llm/cost-calculator';

export interface ReviewRequest {
  code: string;
  filePath: string;
  objective: string;
  context: string;
  testCommand?: string;
}

export interface ReviewAnalysis {
  logicIssues: ReviewIssue[];
  edgeCases: ReviewIssue[];
  securityConcerns: ReviewIssue[];
  performanceIssues: ReviewIssue[];
  maintainabilityIssues: ReviewIssue[];
  overallAssessment: string;
  approved: boolean;
}

export class CriticAgent extends BaseAgent {
  /**
   * Execute code review:
   * 1. Analyze code from Artisan
   * 2. Identify logic issues and edge cases
   * 3. Check for security concerns
   * 4. Provide improvement suggestions
   * 5. Approve or reject code
   */
  protected async onExecute(
    context: AgentContext,
  ): Promise<AgentResult<CriticOutput>> {
    this.emitProgress('Starting code review', {
      file: context.artisanCode?.filePath,
    });

    if (!context.artisanCode) {
      throw new Error('No code from Artisan to review');
    }

    // Track token usage across all LLM calls
    let totalTokensUsed = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      // Step 1: Build review request
      const request = this.buildReviewRequest(context);
      this.emitProgress('Review request prepared');

      // Step 2: Analyze code with GPT
      const { analysis, usage } = await this.analyzeCode(request);
      if (usage) {
        totalTokensUsed += usage.total;
        totalInputTokens += usage.input;
        totalOutputTokens += usage.output;
      }
      this.emitProgress('Code analyzed', {
        issuesFound: analysis.logicIssues.length + analysis.edgeCases.length,
      });

      // Step 3: Categorize and prioritize issues
      const allIssues = this.categorizeIssues(analysis);
      this.emitProgress('Issues categorized', { total: allIssues.length });

      // Step 4: Generate suggestions
      const suggestions = this.generateSuggestions(analysis);

      // Step 5: Make approval decision
      const approved = this.makeApprovalDecision(analysis);
      this.emitProgress(`Code ${approved ? 'APPROVED' : 'REJECTED'}`);

      // Calculate cost from token usage
      const cost = calculateCost(
        this.config.model,
        totalInputTokens,
        totalOutputTokens,
      );

      return {
        success: true,
        data: {
          approved,
          issues: allIssues,
          suggestions,
          overallAssessment: analysis.overallAssessment,
          tokensUsed: totalTokensUsed,
          cost,
        },
        tokensUsed: totalTokensUsed,
        cost,
        duration: 0,
      };
    } catch (error) {
      this.logger.error('Critic execution failed', error);
      throw error;
    }
  }

  /**
   * Build review request from context
   */
  private buildReviewRequest(context: AgentContext): ReviewRequest {
    return {
      code: context.artisanCode!.code,
      filePath: context.artisanCode!.filePath,
      objective: context.objective,
      context: context.librarianContext?.contextSummary || '',
      testCommand: context.test.command,
    };
  }

  /**
   * Analyze code using GPT
   */
  private async analyzeCode(
    request: ReviewRequest,
  ): Promise<{ analysis: ReviewAnalysis; usage: TokenUsage }> {
    const prompt = this.buildReviewPrompt(request);

    try {
      const response = await this.callLLM(prompt, {
        systemPrompt: CRITIC_SYSTEM_PROMPT,
        temperature: 0.2,
        maxTokens: 3000,
      });

      const analysis = this.parseReviewResponse(response.content);
      return { analysis, usage: response.usage };
    } catch (error) {
      this.logger.error('Code analysis failed', error);
      throw new Error(`Failed to analyze code: ${error}`);
    }
  }

  /**
   * Build review prompt for GPT
   */
  private buildReviewPrompt(request: ReviewRequest): string {
    return `Objective: ${request.objective}

File: ${request.filePath}

Code to review:
\`\`\`typescript
${request.code}
\`\`\`

Context:
${request.context}

${request.testCommand ? `Test command: ${request.testCommand}` : ''}

Review this code for:
1. Logic errors and bugs
2. Unhandled edge cases
3. Security vulnerabilities
4. Performance issues
5. Maintainability concerns

Provide your review in JSON format:
{
  "logicIssues": [
    {
      "severity": "critical|warning|info",
      "category": "logic",
      "message": "Issue description",
      "line": 10,
      "suggestion": "How to fix"
    }
  ],
  "edgeCases": [...],
  "securityConcerns": [...],
  "performanceIssues": [...],
  "maintainabilityIssues": [...],
  "overallAssessment": "Summary of the review",
  "approved": true/false
}`;
  }

  /**
   * Parse review response from GPT
   */
  private parseReviewResponse(response: string): ReviewAnalysis {
    try {
      // Extract JSON from response
      const jsonMatch =
        response.match(/```json\s*([\s\S]*?)```/) ||
        response.match(/{[\s\S]*}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const jsonText = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonText);

      return {
        logicIssues: parsed.logicIssues || [],
        edgeCases: parsed.edgeCases || [],
        securityConcerns: parsed.securityConcerns || [],
        performanceIssues: parsed.performanceIssues || [],
        maintainabilityIssues: parsed.maintainabilityIssues || [],
        overallAssessment: parsed.overallAssessment || 'No assessment provided',
        approved: parsed.approved ?? false,
      };
    } catch (error) {
      this.logger.error('Failed to parse review response', error);
      // Return default failure review
      return {
        logicIssues: [
          {
            severity: 'critical',
            category: 'logic',
            message: 'Failed to parse review response - manual review required',
          },
        ],
        edgeCases: [],
        securityConcerns: [],
        performanceIssues: [],
        maintainabilityIssues: [],
        overallAssessment: 'Review parsing failed',
        approved: false,
      };
    }
  }

  /**
   * Categorize all issues
   */
  private categorizeIssues(analysis: ReviewAnalysis): ReviewIssue[] {
    const all: ReviewIssue[] = [
      ...analysis.logicIssues,
      ...analysis.edgeCases,
      ...analysis.securityConcerns,
      ...analysis.performanceIssues,
      ...analysis.maintainabilityIssues,
    ];

    // Sort by severity
    return all.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(analysis: ReviewAnalysis): string[] {
    const suggestions: string[] = [];

    // Critical issues
    const criticalIssues = [
      ...analysis.logicIssues,
      ...analysis.securityConcerns,
    ].filter((i) => i.severity === 'critical');

    if (criticalIssues.length > 0) {
      suggestions.push(
        `Fix ${criticalIssues.length} critical issue(s) before proceeding`,
      );
    }

    // Edge cases
    if (analysis.edgeCases.length > 0) {
      suggestions.push(
        `Add handling for ${analysis.edgeCases.length} identified edge case(s)`,
      );
    }

    // Security
    const securityIssues = analysis.securityConcerns.filter(
      (i) => i.severity !== 'info',
    );
    if (securityIssues.length > 0) {
      suggestions.push(`Address ${securityIssues.length} security concern(s)`);
    }

    // Performance
    if (analysis.performanceIssues.length > 2) {
      suggestions.push('Consider performance optimizations');
    }

    // Maintainability
    if (analysis.maintainabilityIssues.length > 3) {
      suggestions.push('Refactor for improved maintainability');
    }

    return suggestions;
  }

  /**
   * Make approval decision
   */
  private makeApprovalDecision(analysis: ReviewAnalysis): boolean {
    // Automatic rejection if critical issues exist
    const hasCriticalLogic = analysis.logicIssues.some(
      (i) => i.severity === 'critical',
    );
    const hasCriticalSecurity = analysis.securityConcerns.some(
      (i) => i.severity === 'critical',
    );

    if (hasCriticalLogic || hasCriticalSecurity) {
      return false;
    }

    // Use LLM's recommendation as default
    return analysis.approved;
  }

  /**
   * Get issue counts by severity
   */
  private getIssueCounts(issues: ReviewIssue[]): {
    critical: number;
    warning: number;
    info: number;
  } {
    return {
      critical: issues.filter((i) => i.severity === 'critical').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
    };
  }

  /**
   * Format issues for logging
   */
  private formatIssues(issues: ReviewIssue[]): string {
    return issues
      .map((i) => {
        const location = i.file
          ? `${i.file}${i.line ? `:${i.line}` : ''}`
          : 'unknown';
        return `[${i.severity.toUpperCase()}] ${i.category}: ${i.message} (${location})`;
      })
      .join('\n');
  }
}

const CRITIC_SYSTEM_PROMPT = `You are the Critic, a code review expert using GPT-4.1-mini.

Your role:
- Analyze code for logic errors and bugs
- Identify unhandled edge cases
- Spot security vulnerabilities
- Flag performance concerns
- Assess maintainability issues

Focus areas:
1. Correctness: Does the code achieve the objective?
2. Edge cases: Missing null checks, boundary conditions, error handling
3. Security: Input validation, injection risks, sensitive data exposure
4. Performance: Inefficient algorithms, memory leaks, unnecessary operations
5. Maintainability: Code clarity, documentation, modularity

Output requirements:
- Use JSON format with specific issue structure
- Categorize issues by type and severity
- Provide actionable suggestions for fixes
- Make a clear approve/reject decision

Be thorough but pragmatic. Focus on real issues, not style preferences.`;
