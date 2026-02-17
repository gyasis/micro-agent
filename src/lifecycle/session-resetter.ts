/**
 * Session Resetter - Destroy LLM Context
 *
 * Ensures complete destruction of LLM sessions between iterations to maintain
 * the Ralph Loop gold standard: fresh context each iteration.
 *
 * Key responsibilities:
 * 1. Close all active LLM API connections
 * 2. Clear in-memory conversation history
 * 3. Destroy XState machine instance
 * 4. Reset agent state
 * 5. Free memory
 *
 * After reset, the next iteration starts completely fresh - reading state
 * from disk (git working tree + test results + MemoryVault) rather than
 * accumulating context.
 *
 * @module lifecycle/session-resetter
 */

import { EventEmitter } from 'events';

export interface ResetOptions {
  sessionId: string;
  verbose?: boolean;
}

export interface ResetStats {
  timestamp: number;
  iteration: number;
  llmConnectionsClosed: number;
  agentsReset: number;
  memoryFreed: number; // Bytes
  duration: number; // Milliseconds
}

export type AgentCleanup = () => Promise<void>;
export type LLMConnectionCleanup = () => Promise<void>;

export class SessionResetter extends EventEmitter {
  private sessionId: string;
  private verbose: boolean;
  private agentCleanups: Map<string, AgentCleanup> = new Map();
  private llmCleanups: LLMConnectionCleanup[] = [];

  constructor(options: ResetOptions) {
    super();
    this.sessionId = options.sessionId;
    this.verbose = options.verbose || false;
  }

  /**
   * Register agent cleanup function
   */
  public registerAgentCleanup(agent: string, cleanup: AgentCleanup): void {
    this.agentCleanups.set(agent, cleanup);
  }

  /**
   * Register LLM connection cleanup function
   */
  public registerLLMCleanup(cleanup: LLMConnectionCleanup): void {
    this.llmCleanups.push(cleanup);
  }

  /**
   * Perform complete context reset
   */
  public async reset(iteration: number): Promise<ResetStats> {
    const startTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;

    this.log(`Starting context reset for iteration ${iteration}...`);

    // 1. Close LLM connections
    this.log('Closing LLM connections...');
    let llmConnectionsClosed = 0;
    for (const cleanup of this.llmCleanups) {
      try {
        await cleanup();
        llmConnectionsClosed++;
      } catch (error) {
        this.emit('cleanup-error', {
          type: 'llm-connection',
          error: String(error),
        });
      }
    }

    // 2. Reset agents
    this.log('Resetting agents...');
    let agentsReset = 0;
    for (const [agent, cleanup] of this.agentCleanups.entries()) {
      try {
        await cleanup();
        agentsReset++;
        this.log(`  ✓ ${agent} reset`);
      } catch (error) {
        this.emit('cleanup-error', {
          type: 'agent',
          agent,
          error: String(error),
        });
      }
    }

    // 3. Clear cleanup registrations (will be re-registered in next iteration)
    this.agentCleanups.clear();
    this.llmCleanups = [];

    // 4. Force garbage collection if available
    if (global.gc) {
      this.log('Running garbage collection...');
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryFreed = Math.max(0, initialMemory - finalMemory);
    const duration = Date.now() - startTime;

    const stats: ResetStats = {
      timestamp: Date.now(),
      iteration,
      llmConnectionsClosed,
      agentsReset,
      memoryFreed,
      duration,
    };

    this.log(
      `Context reset complete (${duration}ms, ${this.formatBytes(memoryFreed)} freed)`
    );
    this.emit('reset-complete', stats);

    return stats;
  }

  /**
   * Verify reset was successful
   */
  public verifyReset(): {
    verified: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check if cleanups were cleared
    if (this.agentCleanups.size > 0) {
      issues.push(`${this.agentCleanups.size} agent cleanups still registered`);
    }

    if (this.llmCleanups.length > 0) {
      issues.push(`${this.llmCleanups.length} LLM cleanups still registered`);
    }

    return {
      verified: issues.length === 0,
      issues,
    };
  }

  /**
   * Emergency reset - force kill everything
   */
  public async emergencyReset(): Promise<void> {
    this.log('⚠️  Emergency reset triggered!');

    // Clear all registrations immediately
    this.agentCleanups.clear();
    this.llmCleanups = [];

    // Force GC
    if (global.gc) {
      global.gc();
    }

    this.emit('emergency-reset');
  }

  /**
   * Get current registration stats
   */
  public getStats(): {
    agentCleanupsRegistered: number;
    llmCleanupsRegistered: number;
  } {
    return {
      agentCleanupsRegistered: this.agentCleanups.size,
      llmCleanupsRegistered: this.llmCleanups.length,
    };
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`[SessionResetter:${this.sessionId}] ${message}`);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}

/**
 * Factory function to create session resetter
 */
export function createSessionResetter(options: ResetOptions): SessionResetter {
  return new SessionResetter(options);
}

/**
 * Helper to create cleanup function for LLM clients
 */
export function createLLMCleanup(
  client: any,
  connectionName?: string
): LLMConnectionCleanup {
  return async () => {
    if (client && typeof client.close === 'function') {
      await client.close();
    } else if (client && typeof client.destroy === 'function') {
      await client.destroy();
    }
    // Mark for GC
    client = null;
  };
}

/**
 * Helper to create cleanup function for agents
 */
export function createAgentCleanup(resetFn: () => Promise<void>): AgentCleanup {
  return resetFn;
}
