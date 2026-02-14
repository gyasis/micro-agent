/**
 * Cost Tracker - Token Usage Per Agent
 *
 * Tracks LLM API costs per agent with real-time budget monitoring.
 * Enables budget enforcement (max_cost_usd) and cost breakdown reporting.
 *
 * @module llm/cost-tracker
 */

import { EventEmitter } from 'events';

export interface CostEntry {
  agent: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number; // USD
  timestamp: number;
}

export interface AgentCostSummary {
  agent: string;
  requests: number;
  totalTokens: number;
  totalCost: number;
  averageCostPerRequest: number;
  models: Map<string, number>; // model -> cost
}

export interface BudgetAlert {
  currentCost: number;
  budgetLimit: number;
  percentageUsed: number;
  level: 'warning' | 'critical' | 'exceeded';
  message: string;
}

export class CostTracker extends EventEmitter {
  private entries: CostEntry[] = [];
  private agentCosts: Map<string, number> = new Map();
  private totalCost: number = 0;
  private budgetLimit: number;

  constructor(budgetLimit: number = 2.0) {
    super();
    this.budgetLimit = budgetLimit;
  }

  /**
   * Record a cost entry
   */
  public record(entry: Omit<CostEntry, 'timestamp'>): void {
    const fullEntry: CostEntry = {
      ...entry,
      timestamp: Date.now(),
    };

    this.entries.push(fullEntry);

    // Update agent costs
    const current = this.agentCosts.get(entry.agent) || 0;
    this.agentCosts.set(entry.agent, current + entry.cost);

    // Update total
    this.totalCost += entry.cost;

    // Emit cost update
    this.emit('cost-update', {
      entry: fullEntry,
      totalCost: this.totalCost,
      remaining: this.budgetLimit - this.totalCost,
    });

    // Check budget
    this.checkBudget();
  }

  /**
   * Check if budget thresholds are exceeded
   */
  private checkBudget(): void {
    const percentageUsed = (this.totalCost / this.budgetLimit) * 100;

    if (percentageUsed >= 100) {
      const alert: BudgetAlert = {
        currentCost: this.totalCost,
        budgetLimit: this.budgetLimit,
        percentageUsed,
        level: 'exceeded',
        message: `Budget exceeded: $${this.totalCost.toFixed(2)} / $${this.budgetLimit.toFixed(2)}`,
      };
      this.emit('budget-exceeded', alert);
    } else if (percentageUsed >= 90) {
      const alert: BudgetAlert = {
        currentCost: this.totalCost,
        budgetLimit: this.budgetLimit,
        percentageUsed,
        level: 'critical',
        message: `Budget critical: $${this.totalCost.toFixed(2)} / $${this.budgetLimit.toFixed(2)} (${percentageUsed.toFixed(1)}%)`,
      };
      this.emit('budget-critical', alert);
    } else if (percentageUsed >= 75) {
      const alert: BudgetAlert = {
        currentCost: this.totalCost,
        budgetLimit: this.budgetLimit,
        percentageUsed,
        level: 'warning',
        message: `Budget warning: $${this.totalCost.toFixed(2)} / $${this.budgetLimit.toFixed(2)} (${percentageUsed.toFixed(1)}%)`,
      };
      this.emit('budget-warning', alert);
    }
  }

  /**
   * Get total cost
   */
  public getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Get cost for specific agent
   */
  public getAgentCost(agent: string): number {
    return this.agentCosts.get(agent) || 0;
  }

  /**
   * Get summary for all agents
   */
  public getAgentSummaries(): AgentCostSummary[] {
    const summaries: AgentCostSummary[] = [];

    for (const [agent, totalCost] of this.agentCosts.entries()) {
      const agentEntries = this.entries.filter((e) => e.agent === agent);

      const models = new Map<string, number>();
      let totalTokens = 0;

      for (const entry of agentEntries) {
        totalTokens += entry.totalTokens;
        const modelCost = models.get(entry.model) || 0;
        models.set(entry.model, modelCost + entry.cost);
      }

      summaries.push({
        agent,
        requests: agentEntries.length,
        totalTokens,
        totalCost,
        averageCostPerRequest: agentEntries.length > 0 ? totalCost / agentEntries.length : 0,
        models,
      });
    }

    return summaries;
  }

  /**
   * Get budget status
   */
  public getBudgetStatus(): {
    total: number;
    limit: number;
    remaining: number;
    percentageUsed: number;
    withinBudget: boolean;
  } {
    const percentageUsed = (this.totalCost / this.budgetLimit) * 100;
    return {
      total: this.totalCost,
      limit: this.budgetLimit,
      remaining: this.budgetLimit - this.totalCost,
      percentageUsed,
      withinBudget: this.totalCost < this.budgetLimit,
    };
  }

  /**
   * Get cost breakdown by model
   */
  public getCostByModel(): Map<string, number> {
    const breakdown = new Map<string, number>();

    for (const entry of this.entries) {
      const current = breakdown.get(entry.model) || 0;
      breakdown.set(entry.model, current + entry.cost);
    }

    return breakdown;
  }

  /**
   * Get cost breakdown by provider
   */
  public getCostByProvider(): Map<string, number> {
    const breakdown = new Map<string, number>();

    for (const entry of this.entries) {
      const current = breakdown.get(entry.provider) || 0;
      breakdown.set(entry.provider, current + entry.cost);
    }

    return breakdown;
  }

  /**
   * Get all cost entries
   */
  public getEntries(): CostEntry[] {
    return [...this.entries];
  }

  /**
   * Export cost data as CSV
   */
  public exportCSV(): string {
    const header = 'timestamp,agent,model,provider,prompt_tokens,completion_tokens,total_tokens,cost\n';
    const rows = this.entries.map((e) =>
      [
        new Date(e.timestamp).toISOString(),
        e.agent,
        e.model,
        e.provider,
        e.promptTokens,
        e.completionTokens,
        e.totalTokens,
        e.cost.toFixed(6),
      ].join(',')
    );

    return header + rows.join('\n');
  }

  /**
   * Reset all tracking
   */
  public reset(): void {
    this.entries = [];
    this.agentCosts.clear();
    this.totalCost = 0;
    this.emit('reset');
  }

  /**
   * Update budget limit
   */
  public setBudgetLimit(limit: number): void {
    this.budgetLimit = limit;
    this.checkBudget(); // Re-check with new limit
  }
}

/**
 * Factory function to create cost tracker
 */
export function createCostTracker(budgetLimit?: number): CostTracker {
  return new CostTracker(budgetLimit);
}
