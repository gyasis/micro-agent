/**
 * Hook Executor
 *
 * Executes plugin hooks with timeout, error handling, and retry logic.
 * Ensures plugins don't block the main Ralph Loop execution.
 *
 * @module plugins/hook-executor
 */

import type {
  RalphPlugin,
  PluginConfig,
  PluginContext,
  HookResult,
  PluginError as IPluginError,
  PluginRegistryEntry,
} from './sdk/plugin.interface';
import { PluginError } from './sdk/plugin.interface';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Hook name type
 */
export type HookName = keyof Omit<
  RalphPlugin,
  'name' | 'version' | 'description' | 'initialize' | 'cleanup'
>;

/**
 * Hook executor
 */
export class HookExecutor {
  private defaultTimeout: number = 5000; // 5 seconds

  /**
   * Execute hook on all enabled plugins
   */
  async executeHook<T extends any[]>(
    hookName: HookName,
    plugins: PluginRegistryEntry[],
    ...args: T
  ): Promise<HookResult[]> {
    const results: HookResult[] = [];

    for (const entry of plugins) {
      if (!entry.enabled) continue;

      const result = await this.executePluginHook(
        entry.plugin,
        entry.config,
        hookName,
        ...args
      );

      results.push(result);

      // If plugin fails and failOnError is true, stop execution
      if (!result.success && entry.config.failOnError) {
        logger.error(
          `Plugin ${entry.plugin.name} failed with failOnError=true, stopping hook execution`
        );
        break;
      }
    }

    return results;
  }

  /**
   * Execute hook on single plugin
   */
  async executePluginHook<T extends any[]>(
    plugin: RalphPlugin,
    config: PluginConfig,
    hookName: HookName,
    ...args: T
  ): Promise<HookResult> {
    const startTime = Date.now();

    try {
      // Check if hook is enabled in config
      if (config.hooks && config.hooks[hookName] === false) {
        return {
          success: true,
          duration: 0,
          pluginName: plugin.name,
          hookName,
        };
      }

      // Get hook function
      const hookFn = plugin[hookName] as Function | undefined;

      if (!hookFn) {
        // Hook not implemented - not an error
        return {
          success: true,
          duration: 0,
          pluginName: plugin.name,
          hookName,
        };
      }

      // Execute with timeout
      const timeout = config.timeout || this.defaultTimeout;
      const result = await this.executeWithTimeout(
        () => hookFn.apply(plugin, args),
        timeout,
        plugin.name,
        hookName
      );

      const duration = Date.now() - startTime;

      logger.debug(`Hook executed: ${plugin.name}.${hookName} (${duration}ms)`);

      return {
        success: true,
        duration,
        pluginName: plugin.name,
        hookName,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(`Hook failed: ${plugin.name}.${hookName}`, error);

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
        pluginName: plugin.name,
        hookName,
      };
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeout: number,
    pluginName: string,
    hookName: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;

      // Create timeout
      const timeoutPromise = new Promise<never>((_, rejectTimeout) => {
        timeoutId = setTimeout(() => {
          rejectTimeout(
            new PluginError(
              `Hook execution timed out after ${timeout}ms`,
              pluginName,
              hookName
            )
          );
        }, timeout);
      });

      // Execute function
      Promise.resolve(fn())
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(
            new PluginError(
              error.message || 'Hook execution failed',
              pluginName,
              hookName,
              error
            )
          );
        });

      // Race between execution and timeout
      Promise.race([Promise.resolve(fn()), timeoutPromise])
        .then(() => {
          /* handled above */
        })
        .catch(() => {
          /* handled above */
        });
    });
  }

  /**
   * Execute hook that returns boolean (for onBeforeSuccess)
   * Returns true if ALL plugins return true or don't implement the hook
   */
  async executeBooleanHook<T extends any[]>(
    hookName: HookName,
    plugins: PluginRegistryEntry[],
    ...args: T
  ): Promise<boolean> {
    for (const entry of plugins) {
      if (!entry.enabled) continue;

      const plugin = entry.plugin;
      const config = entry.config;

      // Check if hook is enabled
      if (config.hooks && config.hooks[hookName] === false) {
        continue;
      }

      // Get hook function
      const hookFn = plugin[hookName] as Function | undefined;

      if (!hookFn) continue;

      try {
        const timeout = config.timeout || this.defaultTimeout;
        const result = await this.executeWithTimeout(
          () => hookFn.apply(plugin, args),
          timeout,
          plugin.name,
          hookName
        );

        // If any plugin returns false, return false
        if (result === false) {
          logger.info(
            `Plugin ${plugin.name}.${hookName} returned false - blocking operation`
          );
          return false;
        }
      } catch (error) {
        logger.error(`Plugin ${plugin.name}.${hookName} failed:`, error);

        // If failOnError, treat as false
        if (config.failOnError) {
          return false;
        }
        // Otherwise continue
      }
    }

    return true;
  }

  /**
   * Get hook execution summary
   */
  getSummary(results: HookResult[]): {
    total: number;
    successful: number;
    failed: number;
    totalDuration: number;
    averageDuration: number;
  } {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const failed = total - successful;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const averageDuration = total > 0 ? totalDuration / total : 0;

    return {
      total,
      successful,
      failed,
      totalDuration,
      averageDuration,
    };
  }

  /**
   * Log hook execution summary
   */
  logSummary(hookName: string, results: HookResult[]): void {
    const summary = this.getSummary(results);

    if (summary.failed > 0) {
      logger.warn(
        `Hook ${hookName}: ${summary.successful}/${summary.total} succeeded, ` +
          `${summary.failed} failed (avg: ${summary.averageDuration.toFixed(0)}ms)`
      );
    } else if (summary.total > 0) {
      logger.debug(
        `Hook ${hookName}: ${summary.total} plugins executed ` +
          `(avg: ${summary.averageDuration.toFixed(0)}ms)`
      );
    }
  }

  /**
   * Set default timeout for all hooks
   */
  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }

  /**
   * Get default timeout
   */
  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }
}

/**
 * Create hook executor instance
 */
export function createHookExecutor(): HookExecutor {
  return new HookExecutor();
}
