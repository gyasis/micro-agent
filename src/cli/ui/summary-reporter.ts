/**
 * Completion Summary Reporter
 *
 * Generates detailed summary reports after Ralph Loop completion:
 * - Overall results
 * - Iteration breakdown
 * - Cost analysis
 * - Code changes made
 * - Issues identified
 *
 * @module cli/ui/summary-reporter
 */

import type { AgentContext, CriticOutput, ReviewIssue } from '../../agents/base/agent-context';
import { getDiffStats } from '../../agents/artisan/code-writer';

export interface SessionSummary {
  sessionId: string;
  objective: string;
  result: 'success' | 'failure' | 'timeout' | 'budget_exceeded';
  iterations: IterationSummary[];
  totalCost: number;
  totalDuration: number;
  totalTokens: number;
  filesModified: string[];
  issuesFixed: number;
  issuesRemaining: number;
}

export interface IterationSummary {
  iteration: number;
  phase: string;
  cost: number;
  tokensUsed: number;
  duration: number;
  codeChanges?: CodeChangeSummary;
  review?: ReviewSummary;
  testResults?: TestResultSummary;
}

export interface CodeChangeSummary {
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  linesModified: number;
}

export interface ReviewSummary {
  approved: boolean;
  criticalIssues: number;
  warnings: number;
  suggestions: string[];
}

export interface TestResultSummary {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  coverage: number;
}

export class SummaryReporter {
  /**
   * Generate and display complete session summary
   */
  public static generateReport(summary: SessionSummary): void {
    console.log('\n' + '='.repeat(80));
    console.log(this.center('RALPH LOOP COMPLETION SUMMARY', 80));
    console.log('='.repeat(80));

    // Overall result
    this.printOverallResult(summary);

    // Statistics
    this.printStatistics(summary);

    // Iteration breakdown
    this.printIterationBreakdown(summary);

    // Code changes
    this.printCodeChanges(summary);

    // Issues summary
    this.printIssuesSummary(summary);

    // Cost analysis
    this.printCostAnalysis(summary);

    console.log('='.repeat(80));
  }

  /**
   * Print overall result section
   */
  private static printOverallResult(summary: SessionSummary): void {
    const resultEmoji = {
      success: '✅',
      failure: '❌',
      timeout: '⏱️',
      budget_exceeded: '💰',
    };

    const resultText = {
      success: 'SUCCESS',
      failure: 'FAILED',
      timeout: 'TIMEOUT',
      budget_exceeded: 'BUDGET EXCEEDED',
    };

    console.log(`\n${resultEmoji[summary.result]} Result: ${resultText[summary.result]}`);
    console.log(`📋 Objective: ${summary.objective}`);
    console.log(`🆔 Session: ${summary.sessionId.substring(0, 8)}`);
  }

  /**
   * Print statistics section
   */
  private static printStatistics(summary: SessionSummary): void {
    console.log('\n📊 Statistics:');
    console.log(`  Iterations: ${summary.iterations.length}`);
    console.log(`  Duration: ${(summary.totalDuration / 60).toFixed(1)} minutes`);
    console.log(`  Total Cost: $${summary.totalCost.toFixed(4)}`);
    console.log(`  Total Tokens: ${summary.totalTokens.toLocaleString()}`);
    console.log(`  Avg Cost/Iteration: $${(summary.totalCost / summary.iterations.length).toFixed(4)}`);
  }

  /**
   * Print iteration breakdown
   */
  private static printIterationBreakdown(summary: SessionSummary): void {
    console.log('\n🔄 Iteration Breakdown:');

    const table = this.createIterationTable(summary.iterations);
    console.log(table);
  }

  /**
   * Create iteration table
   */
  private static createIterationTable(iterations: IterationSummary[]): string {
    const header = '  Iter  |  Duration  |  Cost   |  Tokens  |  Result';
    const separator = '  ' + '-'.repeat(70);

    const rows = iterations.map(iter => {
      const duration = `${iter.duration.toFixed(1)}s`.padEnd(10);
      const cost = `$${iter.cost.toFixed(4)}`.padEnd(7);
      const tokens = iter.tokensUsed.toLocaleString().padEnd(8);
      const result = this.getIterationResult(iter);

      return `  ${String(iter.iteration).padEnd(6)}|  ${duration}|  ${cost}|  ${tokens}|  ${result}`;
    });

    return [header, separator, ...rows].join('\n');
  }

  /**
   * Get iteration result icon
   */
  private static getIterationResult(iter: IterationSummary): string {
    if (iter.review?.approved && iter.testResults?.passed) {
      return '✓ Passed';
    } else if (iter.review?.approved) {
      return '⚠️  Review OK';
    } else {
      return '✗ Failed';
    }
  }

  /**
   * Print code changes summary
   */
  private static printCodeChanges(summary: SessionSummary): void {
    console.log('\n📝 Code Changes:');
    console.log(`  Files Modified: ${summary.filesModified.length}`);

    if (summary.filesModified.length > 0) {
      console.log(`  Files:`);
      for (const file of summary.filesModified) {
        console.log(`    - ${file}`);
      }
    }

    const totalChanges = summary.iterations.reduce((acc, iter) => {
      const changes = iter.codeChanges;
      if (!changes) return acc;

      return {
        added: acc.added + changes.linesAdded,
        deleted: acc.deleted + changes.linesDeleted,
        modified: acc.modified + changes.linesModified,
      };
    }, { added: 0, deleted: 0, modified: 0 });

    console.log(`  Lines Added: ${totalChanges.added}`);
    console.log(`  Lines Deleted: ${totalChanges.deleted}`);
    console.log(`  Lines Modified: ${totalChanges.modified}`);
  }

  /**
   * Print issues summary
   */
  private static printIssuesSummary(summary: SessionSummary): void {
    console.log('\n🔍 Issues:');
    console.log(`  Fixed: ${summary.issuesFixed}`);
    console.log(`  Remaining: ${summary.issuesRemaining}`);

    // Get issues from last iteration
    const lastIteration = summary.iterations[summary.iterations.length - 1];
    if (lastIteration?.review) {
      const review = lastIteration.review;

      if (review.criticalIssues > 0) {
        console.log(`  ⚠️  ${review.criticalIssues} critical issue(s)`);
      }

      if (review.warnings > 0) {
        console.log(`  ℹ️  ${review.warnings} warning(s)`);
      }

      if (review.suggestions.length > 0) {
        console.log(`  Suggestions:`);
        for (const suggestion of review.suggestions) {
          console.log(`    - ${suggestion}`);
        }
      }
    }
  }

  /**
   * Print cost analysis
   */
  private static printCostAnalysis(summary: SessionSummary): void {
    console.log('\n💰 Cost Breakdown:');

    // Cost by agent (estimated from iterations)
    const byPhase = summary.iterations.reduce((acc, iter) => {
      acc[iter.phase] = (acc[iter.phase] || 0) + iter.cost;
      return acc;
    }, {} as Record<string, number>);

    for (const [phase, cost] of Object.entries(byPhase)) {
      const percentage = (cost / summary.totalCost) * 100;
      console.log(`  ${phase}: $${cost.toFixed(4)} (${percentage.toFixed(1)}%)`);
    }
  }

  /**
   * Center text
   */
  private static center(text: string, width: number): string {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
  }

  /**
   * Generate markdown report
   */
  public static generateMarkdownReport(summary: SessionSummary): string {
    const lines: string[] = [];

    lines.push('# Ralph Loop Summary Report\n');

    // Metadata
    lines.push('## Session Information\n');
    lines.push(`- **Session ID**: \`${summary.sessionId}\``);
    lines.push(`- **Objective**: ${summary.objective}`);
    lines.push(`- **Result**: ${summary.result.toUpperCase()}`);
    lines.push(`- **Duration**: ${(summary.totalDuration / 60).toFixed(1)} minutes`);
    lines.push(`- **Total Cost**: $${summary.totalCost.toFixed(4)}\n`);

    // Statistics
    lines.push('## Statistics\n');
    lines.push(`- **Iterations**: ${summary.iterations.length}`);
    lines.push(`- **Total Tokens**: ${summary.totalTokens.toLocaleString()}`);
    lines.push(`- **Files Modified**: ${summary.filesModified.length}\n`);

    // Iterations
    lines.push('## Iteration Details\n');
    lines.push('| Iteration | Duration | Cost | Tokens | Result |');
    lines.push('|-----------|----------|------|--------|--------|');

    for (const iter of summary.iterations) {
      const result = this.getIterationResult(iter);
      lines.push(
        `| ${iter.iteration} | ${iter.duration.toFixed(1)}s | $${iter.cost.toFixed(4)} | ${iter.tokensUsed.toLocaleString()} | ${result} |`
      );
    }

    lines.push('');

    // Files
    if (summary.filesModified.length > 0) {
      lines.push('## Modified Files\n');
      for (const file of summary.filesModified) {
        lines.push(`- \`${file}\``);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Save report to file
   */
  public static async saveReport(
    summary: SessionSummary,
    filePath: string
  ): Promise<void> {
    const { promises as fs } = await import('fs');
    const markdown = this.generateMarkdownReport(summary);
    await fs.writeFile(filePath, markdown, 'utf-8');
  }
}
