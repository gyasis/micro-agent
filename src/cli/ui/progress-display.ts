/**
 * Real-Time Progress Display
 *
 * Terminal UI for displaying Ralph Loop progress:
 * - Current iteration status
 * - Agent execution phases
 * - Budget consumption
 * - Token usage
 * - Time elapsed
 *
 * @module cli/ui/progress-display
 */

import type { AgentContext } from '../../agents/base/agent-context';

export interface ProgressState {
  iteration: number;
  maxIterations: number;
  phase: string;
  agent?: string;
  cost: number;
  maxCost: number;
  elapsed: number;
  maxDuration: number;
  tokensUsed: number;
  message?: string;
}

export class ProgressDisplay {
  private startTime: number;
  private lastUpdate: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Show iteration header
   */
  public showIteration(iteration: number, maxIterations: number): void {
    console.log('\n' + '='.repeat(70));
    console.log(this.center(`Iteration ${iteration} of ${maxIterations}`, 70));
    console.log('='.repeat(70));
  }

  /**
   * Show phase transition
   */
  public showPhase(phase: string, agent?: string): void {
    const phases: Record<string, string> = {
      context: '📚 Context Analysis',
      generation: '⚙️  Code Generation',
      review: '🔍 Logic Review',
      testing: '🧪 Running Tests',
      adversarial: '⚡ Adversarial Testing',
    };

    const phaseDisplay = phases[phase] || phase;
    const agentDisplay = agent ? ` (${agent})` : '';

    console.log(`\n${phaseDisplay}${agentDisplay}...`);
  }

  /**
   * Show progress update
   */
  public update(state: ProgressState): void {
    // Throttle updates to avoid console spam
    const now = Date.now();
    if (now - this.lastUpdate < 500) return;
    this.lastUpdate = now;

    const lines: string[] = [];

    // Progress bar
    const progress = state.iteration / state.maxIterations;
    const progressBar = this.createProgressBar(progress, 40);
    lines.push(`Progress: ${progressBar} ${(progress * 100).toFixed(0)}%`);

    // Budget
    const budgetUsed = (state.cost / state.maxCost) * 100;
    const budgetBar = this.createProgressBar(state.cost / state.maxCost, 20);
    lines.push(
      `Budget:   ${budgetBar} $${state.cost.toFixed(2)}/$${state.maxCost.toFixed(2)} (${budgetUsed.toFixed(0)}%)`,
    );

    // Time
    const elapsedMin = state.elapsed / 60;
    const timeUsed = (elapsedMin / state.maxDuration) * 100;
    const timeBar = this.createProgressBar(elapsedMin / state.maxDuration, 20);
    lines.push(
      `Time:     ${timeBar} ${elapsedMin.toFixed(1)}/${state.maxDuration} min (${timeUsed.toFixed(0)}%)`,
    );

    // Tokens
    if (state.tokensUsed > 0) {
      lines.push(`Tokens:   ${state.tokensUsed.toLocaleString()}`);
    }

    // Message
    if (state.message) {
      lines.push(`Status:   ${state.message}`);
    }

    // Clear and redraw
    this.clearLines(lines.length);
    console.log(lines.join('\n'));
  }

  /**
   * Show success message
   */
  public showSuccess(result: {
    iteration: number;
    cost: number;
    duration: number;
  }): void {
    console.log('\n' + '='.repeat(70));
    console.log(this.center('🎉 SUCCESS 🎉', 70));
    console.log('='.repeat(70));
    console.log(`Completed in ${result.iteration} iteration(s)`);
    console.log(`Total cost: $${result.cost.toFixed(2)}`);
    console.log(`Duration: ${(result.duration / 60).toFixed(1)} minutes`);
    console.log('='.repeat(70));
  }

  /**
   * Show failure message
   */
  public showFailure(result: {
    iteration: number;
    cost: number;
    duration: number;
    reason?: string;
  }): void {
    console.log('\n' + '='.repeat(70));
    console.log(this.center('❌ FAILED ❌', 70));
    console.log('='.repeat(70));
    console.log(`Stopped at iteration ${result.iteration}`);
    console.log(`Total cost: $${result.cost.toFixed(2)}`);
    console.log(`Duration: ${(result.duration / 60).toFixed(1)} minutes`);

    if (result.reason) {
      console.log(`Reason: ${result.reason}`);
    }

    console.log('='.repeat(70));
  }

  /**
   * Show agent activity
   */
  public showAgentActivity(agent: string, activity: string): void {
    const emoji: Record<string, string> = {
      librarian: '📚',
      artisan: '⚙️',
      critic: '🔍',
      chaos: '⚡',
    };

    console.log(`  ${emoji[agent] || '▸'} ${agent}: ${activity}`);
  }

  /**
   * Show warning
   */
  public showWarning(message: string): void {
    console.log(`⚠️  ${message}`);
  }

  /**
   * Show error
   */
  public showError(message: string): void {
    console.log(`❌ ${message}`);
  }

  /**
   * Show info
   */
  public showInfo(message: string): void {
    console.log(`ℹ️  ${message}`);
  }

  /**
   * Create progress bar
   */
  private createProgressBar(progress: number, width: number): string {
    const filled = Math.floor(progress * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    // Color based on progress
    if (progress >= 0.9) {
      return this.colorize(bar, 'red');
    } else if (progress >= 0.7) {
      return this.colorize(bar, 'yellow');
    } else {
      return this.colorize(bar, 'green');
    }
  }

  /**
   * Colorize text
   */
  private colorize(text: string, color: string): string {
    const colors: Record<string, string> = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
    };

    const reset = '\x1b[0m';
    return `${colors[color] || ''}${text}${reset}`;
  }

  /**
   * Center text
   */
  private center(text: string, width: number): string {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
  }

  /**
   * Clear console lines
   */
  private clearLines(count: number): void {
    for (let i = 0; i < count; i++) {
      process.stdout.write('\x1b[1A'); // Move up
      process.stdout.write('\x1b[2K'); // Clear line
    }
  }

  /**
   * Get elapsed time
   */
  public getElapsed(): number {
    return (Date.now() - this.startTime) / 1000;
  }
}

/**
 * Create state from context
 */
export function createProgressState(
  context: AgentContext,
  elapsed: number,
  tokensUsed: number = 0,
  message?: string,
): ProgressState {
  return {
    iteration: context.iteration.iteration,
    maxIterations: context.iteration.maxIterations,
    phase: context.iteration.currentPhase,
    cost: context.budget.currentCostUsd,
    maxCost: context.budget.maxCostUsd,
    elapsed,
    maxDuration: context.budget.maxDurationMinutes * 60,
    tokensUsed,
    message,
  };
}
