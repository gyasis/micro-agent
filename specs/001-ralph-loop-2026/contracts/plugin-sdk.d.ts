/**
 * Ralph Loop Plugin SDK Type Definitions
 *
 * This file provides TypeScript type definitions for plugin authors.
 * Import this in your plugin to get full type safety and IntelliSense.
 *
 * @example
 * ```typescript
 * import type { RalphPlugin, PluginContext } from 'ralph-loop/plugin-sdk';
 *
 * export const myPlugin: RalphPlugin = {
 *   name: 'my-custom-plugin',
 *   version: '1.0.0',
 *   async onBeforeGen(context: PluginContext) {
 *     console.log('Running before code generation');
 *   }
 * };
 * ```
 */

declare module 'ralph-loop/plugin-sdk' {
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
     * @returns true to allow success, false to block
     */
    onBeforeSuccess?(
      context: PluginContext,
      results: IterationResults
    ): Promise<boolean> | boolean;

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
    readonly sessionId: string;
    readonly iteration: number;
    readonly targetFile: string;
    readonly objective: string;
    readonly codebaseFiles: ReadonlyMap<string, string>;
    readonly librarianOutput: any | null;
    readonly artisanOutput: any | null;
    readonly criticOutput: any | null;
    readonly testResults: any | null;
    readonly adversarialResults: any | null;
    readonly errors: readonly string[];
    readonly contextUsage: ReadonlyMap<string, number>;
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
   * Plugin error
   */
  export class PluginError extends Error {
    constructor(
      message: string,
      pluginName: string,
      hookName: string,
      originalError?: Error
    );
    readonly pluginName: string;
    readonly hookName: string;
    readonly originalError?: Error;
  }

  // ============================================================================
  // Plugin Creation Helpers
  // ============================================================================

  /**
   * Create a typed plugin with full IntelliSense support
   */
  export function definePlugin(plugin: RalphPlugin): RalphPlugin;

  /**
   * Create a simple plugin that only hooks into specific lifecycle events
   */
  export function createSimplePlugin(config: {
    name: string;
    version: string;
    description?: string;
    hooks: Partial<Omit<RalphPlugin, 'name' | 'version' | 'description'>>;
  }): RalphPlugin;

  // ============================================================================
  // Plugin Examples (for documentation)
  // ============================================================================

  /**
   * Example: Notification plugin
   * @example
   * ```typescript
   * export const notificationPlugin: RalphPlugin = {
   *   name: 'notifications',
   *   version: '1.0.0',
   *   async onSuccess(context, results) {
   *     await sendSlackNotification(`✅ Iteration ${context.iteration} succeeded!`);
   *   },
   *   async onTestFail(context, failure) {
   *     await sendSlackNotification(`❌ Test failed: ${failure.testName}`);
   *   }
   * };
   * ```
   */
  export const examples: {
    notificationPlugin: RalphPlugin;
    lintingPlugin: RalphPlugin;
    analyticsPlugin: RalphPlugin;
  };
}

// ============================================================================
// Global Type Augmentation
// ============================================================================

/**
 * Augment global namespace with Ralph Loop plugin types
 * This allows using types without explicit imports
 */
declare global {
  namespace RalphLoop {
    export {
      RalphPlugin,
      PluginContext,
      GeneratedCode,
      CodeChange,
      TestFailure,
      IterationResults,
      BudgetStatus,
      EntropyStatus,
      PluginConfig,
      HookResult,
      PluginError,
    };
  }
}

export {};
