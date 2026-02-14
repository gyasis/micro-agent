/**
 * Context Monitor - Smart Zone Boundary Tracking
 *
 * Monitors cumulative token usage per agent per iteration and triggers
 * automatic context reset at 40% usage (smart zone boundary) to prevent
 * quality degradation that occurs in the "dumb zone" (>40% context usage).
 *
 * Key principle: Fresh context each iteration is the GOLD STANDARD.
 * This monitor provides a safety net even if user configures
 * context_reset_frequency > 1.
 *
 * @module lifecycle/context-monitor
 */

import { EventEmitter } from 'events';

export interface ModelContextLimits {
  [model: string]: number;
}

export interface ContextUsage {
  agent: string;
  model: string;
  tokens: number;
  percentage: number;
  timestamp: number;
}

export interface ContextWarning {
  agent: string;
  model: string;
  usage: number;
  limit: number;
  percentage: number;
  level: 'info' | 'warning' | 'critical';
  message: string;
}

/**
 * Context window limits for supported models (tokens)
 */
export const DEFAULT_CONTEXT_LIMITS: ModelContextLimits = {
  // Claude models
  'claude-sonnet-4.5': 200_000,
  'claude-opus-4': 200_000,
  'claude-haiku-4': 200_000,

  // Gemini models
  'gemini-2.0-pro': 1_000_000,
  'gemini-1.5-pro': 1_000_000,
  'gemini-1.5-flash': 1_000_000,

  // GPT models
  'gpt-4.1-mini': 128_000,
  'gpt-4': 128_000,
  'gpt-4-turbo': 128_000,
  'o1-preview': 128_000,

  // Ollama (varies by model, conservative default)
  'llama3': 8_000,
  'mistral': 8_000,
};

/**
 * Smart zone thresholds
 */
export const THRESHOLDS = {
  SAFE: 0.3, // 30% - safe zone
  WARNING: 0.4, // 40% - smart zone boundary (AUTOMATIC RESET)
  CRITICAL: 0.5, // 50% - dumb zone (should never reach with monitoring)
};

export class ContextMonitor extends EventEmitter {
  private tokenCounts: Map<string, number> = new Map(); // agent -> cumulative tokens
  private contextLimits: ModelContextLimits;
  private agentModels: Map<string, string> = new Map(); // agent -> model

  constructor(contextLimits?: ModelContextLimits) {
    super();
    this.contextLimits = contextLimits || DEFAULT_CONTEXT_LIMITS;
  }

  /**
   * Register which model an agent is using
   */
  public registerAgent(agent: string, model: string): void {
    this.agentModels.set(agent, model);

    if (!this.contextLimits[model]) {
      console.warn(`⚠️  Unknown model "${model}" - using conservative 8k token limit`);
      this.contextLimits[model] = 8_000;
    }
  }

  /**
   * Track tokens used by an agent
   * Returns warning if thresholds exceeded
   */
  public trackTokens(agent: string, tokens: number): ContextWarning | null {
    const model = this.agentModels.get(agent);
    if (!model) {
      throw new Error(`Agent "${agent}" not registered. Call registerAgent() first.`);
    }

    const current = this.tokenCounts.get(agent) || 0;
    const newTotal = current + tokens;
    this.tokenCounts.set(agent, newTotal);

    const limit = this.contextLimits[model];
    const percentage = newTotal / limit;

    // Emit usage update
    this.emit('usage-update', {
      agent,
      model,
      tokens: newTotal,
      percentage,
      timestamp: Date.now(),
    });

    // Check thresholds
    if (percentage >= THRESHOLDS.CRITICAL) {
      const warning: ContextWarning = {
        agent,
        model,
        usage: newTotal,
        limit,
        percentage,
        level: 'critical',
        message: `CRITICAL: ${agent} at ${(percentage * 100).toFixed(1)}% context usage - entered dumb zone!`,
      };
      this.emit('threshold-critical', warning);
      return warning;
    }

    if (percentage >= THRESHOLDS.WARNING) {
      const warning: ContextWarning = {
        agent,
        model,
        usage: newTotal,
        limit,
        percentage,
        level: 'warning',
        message: `WARNING: ${agent} at ${(percentage * 100).toFixed(1)}% - AUTOMATIC RESET REQUIRED (40% smart zone boundary)`,
      };
      this.emit('threshold-warning', warning);
      return warning;
    }

    if (percentage >= THRESHOLDS.SAFE) {
      const warning: ContextWarning = {
        agent,
        model,
        usage: newTotal,
        limit,
        percentage,
        level: 'info',
        message: `INFO: ${agent} at ${(percentage * 100).toFixed(1)}% - approaching smart zone boundary`,
      };
      this.emit('threshold-info', warning);
      return warning;
    }

    return null;
  }

  /**
   * Get current usage for an agent
   */
  public getUsage(agent: string): ContextUsage | null {
    const model = this.agentModels.get(agent);
    if (!model) return null;

    const tokens = this.tokenCounts.get(agent) || 0;
    const limit = this.contextLimits[model];

    return {
      agent,
      model,
      tokens,
      percentage: tokens / limit,
      timestamp: Date.now(),
    };
  }

  /**
   * Get usage for all agents
   */
  public getAllUsage(): ContextUsage[] {
    const usage: ContextUsage[] = [];
    for (const [agent, model] of this.agentModels.entries()) {
      const tokens = this.tokenCounts.get(agent) || 0;
      const limit = this.contextLimits[model];
      usage.push({
        agent,
        model,
        tokens,
        percentage: tokens / limit,
        timestamp: Date.now(),
      });
    }
    return usage;
  }

  /**
   * Check if any agent has exceeded smart zone boundary (40%)
   */
  public shouldResetContext(): boolean {
    for (const [agent, tokens] of this.tokenCounts.entries()) {
      const model = this.agentModels.get(agent);
      if (!model) continue;

      const limit = this.contextLimits[model];
      const percentage = tokens / limit;

      if (percentage >= THRESHOLDS.WARNING) {
        return true; // Automatic reset required
      }
    }
    return false;
  }

  /**
   * Reset all token counts (called after context reset)
   */
  public reset(): void {
    this.tokenCounts.clear();
    this.emit('reset', { timestamp: Date.now() });
  }

  /**
   * Get summary stats
   */
  public getSummary(): {
    agents: number;
    totalTokens: number;
    maxUsagePercentage: number;
    maxUsageAgent: string | null;
    resetRequired: boolean;
  } {
    let totalTokens = 0;
    let maxPercentage = 0;
    let maxAgent: string | null = null;

    for (const [agent, tokens] of this.tokenCounts.entries()) {
      totalTokens += tokens;
      const model = this.agentModels.get(agent);
      if (!model) continue;

      const limit = this.contextLimits[model];
      const percentage = tokens / limit;

      if (percentage > maxPercentage) {
        maxPercentage = percentage;
        maxAgent = agent;
      }
    }

    return {
      agents: this.agentModels.size,
      totalTokens,
      maxUsagePercentage: maxPercentage,
      maxUsageAgent: maxAgent,
      resetRequired: maxPercentage >= THRESHOLDS.WARNING,
    };
  }
}

/**
 * Factory function to create context monitor with defaults
 */
export function createContextMonitor(customLimits?: ModelContextLimits): ContextMonitor {
  return new ContextMonitor({ ...DEFAULT_CONTEXT_LIMITS, ...customLimits });
}
