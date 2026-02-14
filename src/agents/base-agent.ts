/**
 * Base Agent Interface
 *
 * Foundation for all Ralph Loop agents (Librarian, Artisan, Critic, Chaos).
 * Provides common event-driven lifecycle, token tracking, and error handling.
 *
 * @module agents/base-agent
 */

import { EventEmitter } from 'events';
import type { Logger } from '../utils/logger';
import type { ProviderRouter } from '../llm/provider-router';
import type { CostTracker } from '../llm/cost-tracker';

export type AgentType = 'librarian' | 'artisan' | 'critic' | 'chaos';

export interface AgentConfig {
  type: AgentType;
  provider: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AgentContext {
  sessionId: string;
  iteration: number;
  objective: string;
  workingDirectory: string;
  testCommand?: string;
  additionalContext?: Record<string, any>;
}

export interface AgentResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  tokensUsed: number;
  cost: number;
  duration: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

/**
 * Base Agent Abstract Class
 *
 * All Ralph Loop agents extend this base class to inherit:
 * - Event-driven lifecycle
 * - Token and cost tracking
 * - Provider integration
 * - Error handling
 * - Logging
 */
export abstract class BaseAgent extends EventEmitter {
  protected config: AgentConfig;
  protected logger: Logger;
  protected providerRouter: ProviderRouter;
  protected costTracker: CostTracker;
  protected context: AgentContext | null = null;

  constructor(
    config: AgentConfig,
    logger: Logger,
    providerRouter: ProviderRouter,
    costTracker: CostTracker
  ) {
    super();
    this.config = config;
    this.logger = logger.child({ agent: config.type });
    this.providerRouter = providerRouter;
    this.costTracker = costTracker;
  }

  /**
   * Initialize the agent with context
   */
  public async initialize(context: AgentContext): Promise<void> {
    this.context = context;
    this.logger.info(`${this.config.type} agent initialized`, {
      session: context.sessionId,
      iteration: context.iteration,
    });

    this.emit('initialized', { agent: this.config.type, context });
    await this.onInitialize(context);
  }

  /**
   * Execute the agent's primary task
   */
  public async execute(): Promise<AgentResult> {
    if (!this.context) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    this.logger.info(`${this.config.type} agent executing`);
    this.emit('execution:start', { agent: this.config.type });

    try {
      // Execute agent-specific logic
      const result = await this.onExecute(this.context);

      const duration = Date.now() - startTime;

      // Track cost
      this.costTracker.record({
        agent: this.config.type,
        provider: this.config.provider,
        model: this.config.model,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
      });

      // Emit success event
      this.emit('execution:complete', {
        agent: this.config.type,
        success: true,
        duration,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
      });

      this.logger.info(`${this.config.type} agent completed`, {
        duration,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
      });

      return {
        ...result,
        success: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.emit('execution:error', {
        agent: this.config.type,
        error,
        duration,
      });

      this.logger.error(`${this.config.type} agent failed`, error);

      return {
        success: false,
        error: error as Error,
        tokensUsed: 0,
        cost: 0,
        duration,
      };
    }
  }

  /**
   * Cleanup and reset agent state
   */
  public async cleanup(): Promise<void> {
    this.logger.info(`${this.config.type} agent cleaning up`);
    await this.onCleanup();
    this.context = null;
    this.emit('cleanup', { agent: this.config.type });
  }

  /**
   * Get current agent configuration
   */
  public getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Get current agent context
   */
  public getContext(): AgentContext | null {
    return this.context ? { ...this.context } : null;
  }

  /**
   * Update agent configuration
   */
  public updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.info(`${this.config.type} config updated`, updates);
  }

  /**
   * Send prompt to LLM provider
   */
  protected async callLLM(
    prompt: string,
    options?: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<{ content: string; usage: TokenUsage }> {
    const response = await this.providerRouter.complete({
      provider: this.config.provider,
      model: this.config.model,
      messages: [
        ...(options?.systemPrompt
          ? [{ role: 'system' as const, content: options.systemPrompt }]
          : []),
        { role: 'user' as const, content: prompt },
      ],
      temperature: options?.temperature ?? this.config.temperature,
      maxTokens: options?.maxTokens ?? this.config.maxTokens,
    });

    return {
      content: response.content,
      usage: response.usage,
    };
  }

  /**
   * Emit progress update
   */
  protected emitProgress(message: string, data?: any): void {
    this.emit('progress', {
      agent: this.config.type,
      message,
      data,
    });
  }

  /**
   * Emit warning
   */
  protected emitWarning(message: string, data?: any): void {
    this.emit('warning', {
      agent: this.config.type,
      message,
      data,
    });
    this.logger.warn(message, data);
  }

  /**
   * Hook: Called after initialize()
   * Override in subclasses for agent-specific initialization
   */
  protected async onInitialize(context: AgentContext): Promise<void> {
    // Default: no-op
  }

  /**
   * Hook: Main execution logic
   * MUST be implemented by subclasses
   */
  protected abstract onExecute(context: AgentContext): Promise<AgentResult>;

  /**
   * Hook: Called before cleanup()
   * Override in subclasses for agent-specific cleanup
   */
  protected async onCleanup(): Promise<void> {
    // Default: no-op
  }
}

/**
 * Agent Factory
 * Creates agent instances based on configuration
 */
export interface AgentFactory {
  createAgent(
    type: AgentType,
    config: AgentConfig,
    logger: Logger,
    providerRouter: ProviderRouter,
    costTracker: CostTracker
  ): BaseAgent;
}

/**
 * Agent Events
 * Type-safe event definitions for agent lifecycle
 */
export interface AgentEvents {
  initialized: { agent: AgentType; context: AgentContext };
  'execution:start': { agent: AgentType };
  'execution:complete': {
    agent: AgentType;
    success: boolean;
    duration: number;
    tokensUsed: number;
    cost: number;
  };
  'execution:error': { agent: AgentType; error: Error; duration: number };
  progress: { agent: AgentType; message: string; data?: any };
  warning: { agent: AgentType; message: string; data?: any };
  cleanup: { agent: AgentType };
}

/**
 * Type-safe event emitter for agents
 */
export interface TypedAgentEmitter {
  on<K extends keyof AgentEvents>(event: K, listener: (data: AgentEvents[K]) => void): this;
  emit<K extends keyof AgentEvents>(event: K, data: AgentEvents[K]): boolean;
}
