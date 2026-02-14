/**
 * Plugin Interface
 *
 * Defines the contract for Ralph Loop plugins.
 * Plugins can hook into lifecycle stages to extend functionality.
 *
 * @module plugins/sdk/plugin.interface
 */

import type { RalphContext } from '../../state-machine/ralph-machine';

/**
 * Plugin lifecycle hooks
 * All hooks are optional - implement only what you need
 */
export interface RalphPlugin {
  /**
   * Plugin metadata
   */
  name: string;
  version: string;
  description?: string;

  /**
   * Hook: Before code generation (artisan)
   * Use to: Modify context, add custom analysis
   */
  onBeforeGen?(context: PluginContext): Promise<void> | void;

  /**
   * Hook: After code generation (artisan)
   * Use to: Validate generated code, run custom checks
   */
  onAfterGen?(context: PluginContext, code: GeneratedCode): Promise<void> | void;

  /**
   * Hook: After test failure
   * Use to: Custom error handling, notifications, analytics
   */
  onTestFail?(context: PluginContext, failure: TestFailure): Promise<void> | void;

  /**
   * Hook: Before iteration success
   * Use to: Final validations, custom success criteria
   */
  onBeforeSuccess?(context: PluginContext, results: IterationResults): Promise<boolean> | boolean;

  /**
   * Hook: On iteration success
   * Use to: Notifications, logging, cleanup
   */
  onSuccess?(context: PluginContext, results: IterationResults): Promise<void> | void;

  /**
   * Hook: On iteration failure
   * Use to: Cleanup, rollback, notifications
   */
  onFailure?(context: PluginContext, error: Error): Promise<void> | void;

  /**
   * Hook: On context reset
   * Use to: Cleanup plugin state before fresh context
   */
  onContextReset?(context: PluginContext): Promise<void> | void;

  /**
   * Hook: On budget exceeded
   * Use to: Emergency cleanup, save state
   */
  onBudgetExceeded?(context: PluginContext, budget: BudgetStatus): Promise<void> | void;

  /**
   * Hook: On entropy detected
   * Use to: Custom circuit breaker logic
   */
  onEntropyDetected?(context: PluginContext, entropy: EntropyStatus): Promise<void> | void;

  /**
   * Hook: Initialize plugin
   * Called once when plugin is loaded
   */
  initialize?(config: PluginConfig): Promise<void> | void;

  /**
   * Hook: Cleanup plugin
   * Called when Ralph Loop exits
   */
  cleanup?(): Promise<void> | void;
}

/**
 * Plugin context passed to hooks
 * Read-only view of current iteration state
 */
export interface PluginContext {
  sessionId: string;
  iteration: number;
  targetFile: string;
  objective: string;
  codebaseFiles: ReadonlyMap<string, string>;
  librarianOutput: any | null;
  artisanOutput: any | null;
  criticOutput: any | null;
  testResults: any | null;
  adversarialResults: any | null;
  errors: readonly string[];
  contextUsage: ReadonlyMap<string, number>;
}

/**
 * Generated code from Artisan
 */
export interface GeneratedCode {
  filePath: string;
  code: string;
  language: string;
  changes: CodeChange[];
  tokensUsed: number;
}

/**
 * Code change details
 */
export interface CodeChange {
  type: 'create' | 'update' | 'delete';
  path: string;
  oldContent?: string;
  newContent?: string;
  lineNumbers?: { start: number; end: number };
}

/**
 * Test failure details
 */
export interface TestFailure {
  testName: string;
  errorMessage: string;
  stackTrace?: string;
  category: string;
  filePath?: string;
  lineNumber?: number;
}

/**
 * Iteration results
 */
export interface IterationResults {
  success: boolean;
  iteration: number;
  testsPass: boolean;
  adversarialTestsPass: boolean;
  tokensUsed: number;
  cost: number;
  duration: number;
  code?: GeneratedCode;
}

/**
 * Budget status
 */
export interface BudgetStatus {
  iterations: { current: number; max: number };
  cost: { current: number; max: number };
  duration: { current: number; max: number };
  exceeded: 'iterations' | 'cost' | 'duration';
}

/**
 * Entropy status
 */
export interface EntropyStatus {
  errorCount: number;
  threshold: number;
  repeatingErrors: string[];
  suggestedAction: 'continue' | 'stop' | 'reset';
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  /**
   * Plugin-specific settings
   */
  settings?: Record<string, any>;

  /**
   * Hook execution timeout (ms)
   * Default: 5000ms (5 seconds)
   */
  timeout?: number;

  /**
   * Enable/disable specific hooks
   */
  hooks?: {
    onBeforeGen?: boolean;
    onAfterGen?: boolean;
    onTestFail?: boolean;
    onBeforeSuccess?: boolean;
    onSuccess?: boolean;
    onFailure?: boolean;
    onContextReset?: boolean;
    onBudgetExceeded?: boolean;
    onEntropyDetected?: boolean;
  };

  /**
   * Fail iteration if hook throws error
   * Default: false (log error and continue)
   */
  failOnError?: boolean;
}

/**
 * Plugin hook result
 */
export interface HookResult {
  success: boolean;
  error?: Error;
  duration: number;
  pluginName: string;
  hookName: string;
}

/**
 * Plugin execution context
 * Internal context for hook execution
 */
export interface PluginExecutionContext {
  plugin: RalphPlugin;
  config: PluginConfig;
  startTime: number;
  timeout: number;
}

/**
 * Plugin registry entry
 */
export interface PluginRegistryEntry {
  plugin: RalphPlugin;
  config: PluginConfig;
  enabled: boolean;
  loadTime: number;
}

/**
 * Plugin error
 */
export class PluginError extends Error {
  constructor(
    message: string,
    public pluginName: string,
    public hookName: string,
    public originalError?: Error
  ) {
    super(`[${pluginName}:${hookName}] ${message}`);
    this.name = 'PluginError';
  }
}
