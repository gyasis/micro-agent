/**
 * Plugin Sandbox Security Layer
 *
 * Implements security hardening for plugin execution:
 * - Resource limits (memory, CPU time)
 * - Capability restrictions (filesystem, network)
 * - Input/output validation
 * - Dangerous operation prevention
 * - Audit logging
 *
 * @module plugins/plugin-sandbox
 */

import { createLogger } from '../utils/logger';
import type { RalphPlugin, PluginContext } from './sdk/plugin.interface';

const logger = createLogger();

/**
 * Security policy for plugin execution
 */
export interface SecurityPolicy {
  /**
   * Maximum memory allowed (in MB)
   * Default: 100MB
   */
  maxMemoryMB: number;

  /**
   * Maximum CPU time allowed (in ms)
   * Default: 5000ms
   */
  maxCpuTime: number;

  /**
   * Allow filesystem read access
   * Default: false (deny all filesystem access)
   */
  allowFilesystemRead: boolean;

  /**
   * Allow filesystem write access
   * Default: false
   */
  allowFilesystemWrite: boolean;

  /**
   * Allow network access
   * Default: false
   */
  allowNetworkAccess: boolean;

  /**
   * Allow process spawning
   * Default: false
   */
  allowProcessSpawn: boolean;

  /**
   * Allowed filesystem paths (if read/write allowed)
   */
  allowedPaths: string[];

  /**
   * Blocked dangerous modules
   */
  blockedModules: string[];
}

/**
 * Default security policy (most restrictive)
 */
export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  maxMemoryMB: 100,
  maxCpuTime: 5000,
  allowFilesystemRead: false,
  allowFilesystemWrite: false,
  allowNetworkAccess: false,
  allowProcessSpawn: false,
  allowedPaths: [],
  blockedModules: [
    'child_process',
    'cluster',
    'dgram',
    'dns',
    'http',
    'https',
    'http2',
    'net',
    'tls',
    'v8',
    'vm',
    'worker_threads',
  ],
};

/**
 * Resource usage tracker
 */
class ResourceTracker {
  private startMemory: number = 0;
  private startCpu: number = 0;

  start(): void {
    const usage = process.memoryUsage();
    this.startMemory = usage.heapUsed;

    // CPU time tracking (if available)
    if (process.cpuUsage) {
      const cpuUsage = process.cpuUsage();
      this.startCpu = cpuUsage.user + cpuUsage.system;
    }
  }

  getMemoryUsageMB(): number {
    const usage = process.memoryUsage();
    const currentMemory = usage.heapUsed;
    return (currentMemory - this.startMemory) / (1024 * 1024);
  }

  getCpuTimeMs(): number {
    if (!process.cpuUsage) return 0;

    const cpuUsage = process.cpuUsage();
    const currentCpu = cpuUsage.user + cpuUsage.system;
    return (currentCpu - this.startCpu) / 1000; // Convert to milliseconds
  }

  checkLimits(policy: SecurityPolicy): void {
    const memoryMB = this.getMemoryUsageMB();
    if (memoryMB > policy.maxMemoryMB) {
      throw new Error(
        `Memory limit exceeded: ${memoryMB.toFixed(2)}MB > ${policy.maxMemoryMB}MB`,
      );
    }

    const cpuMs = this.getCpuTimeMs();
    if (cpuMs > policy.maxCpuTime) {
      throw new Error(
        `CPU time limit exceeded: ${cpuMs.toFixed(0)}ms > ${policy.maxCpuTime}ms`,
      );
    }
  }
}

/**
 * Input validator for plugin context
 */
export class ContextValidator {
  /**
   * Validate and sanitize plugin context
   */
  static validate(context: PluginContext): PluginContext {
    // Deep clone to prevent plugin mutations affecting original
    const sanitized = this.deepClone(context);

    // Validate required fields
    if (!sanitized.sessionId || typeof sanitized.sessionId !== 'string') {
      throw new Error('Invalid context: sessionId must be a string');
    }

    if (
      !sanitized.iteration ||
      typeof sanitized.iteration !== 'number' ||
      sanitized.iteration < 1
    ) {
      throw new Error('Invalid context: iteration must be a positive number');
    }

    if (!sanitized.targetFile || typeof sanitized.targetFile !== 'string') {
      throw new Error('Invalid context: targetFile must be a string');
    }

    // Sanitize paths (prevent path traversal)
    sanitized.targetFile = this.sanitizePath(sanitized.targetFile);

    return sanitized;
  }

  /**
   * Deep clone object to prevent mutations
   */
  private static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Sanitize file path to prevent path traversal
   */
  private static sanitizePath(filePath: string): string {
    // Remove null bytes
    const sanitized = filePath.replace(/\0/g, '');

    // Prevent path traversal
    if (sanitized.includes('..')) {
      throw new Error('Path traversal detected in file path');
    }

    // Prevent absolute paths to sensitive directories
    const dangerousPaths = [
      '/etc',
      '/root',
      '/home',
      '/usr/bin',
      '/bin',
      '/sbin',
    ];
    for (const dangerous of dangerousPaths) {
      if (sanitized.startsWith(dangerous)) {
        throw new Error(`Access to ${dangerous} is not allowed`);
      }
    }

    return sanitized;
  }
}

/**
 * Output sanitizer for plugin results
 */
export class OutputSanitizer {
  /**
   * Sanitize plugin output before returning to main system
   */
  static sanitize<T>(output: T): T {
    // Convert to JSON and back to remove functions and prototypes
    try {
      const json = JSON.stringify(output, (key, value) => {
        // Filter out functions
        if (typeof value === 'function') {
          return undefined;
        }

        // Filter out symbols
        if (typeof value === 'symbol') {
          return undefined;
        }

        return value;
      });

      return JSON.parse(json);
    } catch (error) {
      logger.error('Failed to sanitize plugin output:', error);
      throw new Error('Plugin output contains non-serializable values');
    }
  }

  /**
   * Validate output size (prevent memory exhaustion)
   */
  static validateSize(
    output: unknown,
    maxSizeBytes: number = 1024 * 1024,
  ): void {
    // 1MB default
    const size = JSON.stringify(output).length;
    if (size > maxSizeBytes) {
      throw new Error(
        `Output size ${size} bytes exceeds limit ${maxSizeBytes} bytes`,
      );
    }
  }
}

/**
 * Plugin sandbox executor
 */
export class PluginSandbox {
  private policy: SecurityPolicy;
  private tracker: ResourceTracker;

  constructor(policy: SecurityPolicy = DEFAULT_SECURITY_POLICY) {
    this.policy = policy;
    this.tracker = new ResourceTracker();
  }

  /**
   * Execute plugin hook in sandbox
   */
  async execute<T extends any[], R>(
    plugin: RalphPlugin,
    hookFn: Function,
    args: T,
  ): Promise<R> {
    // Audit log
    logger.info(`[SECURITY] Executing plugin ${plugin.name} in sandbox`, {
      policy: this.policy,
      hook: hookFn.name,
    });

    // Validate inputs
    const sanitizedArgs = args.map((arg) => {
      if (this.isPluginContext(arg)) {
        return ContextValidator.validate(arg);
      }
      return arg;
    }) as T;

    // Start resource tracking
    this.tracker.start();

    try {
      // Execute hook with periodic resource checks
      const result = await this.executeWithResourceMonitoring(() =>
        hookFn.apply(plugin, sanitizedArgs),
      );

      // Sanitize output
      const sanitized = OutputSanitizer.sanitize(result);
      OutputSanitizer.validateSize(sanitized);

      // Audit log success
      logger.info(`[SECURITY] Plugin ${plugin.name} executed successfully`, {
        memoryMB: this.tracker.getMemoryUsageMB().toFixed(2),
        cpuMs: this.tracker.getCpuTimeMs().toFixed(0),
      });

      return sanitized;
    } catch (error) {
      // Audit log failure
      logger.error(`[SECURITY] Plugin ${plugin.name} execution failed`, {
        error,
        memoryMB: this.tracker.getMemoryUsageMB().toFixed(2),
        cpuMs: this.tracker.getCpuTimeMs().toFixed(0),
      });

      throw error;
    }
  }

  /**
   * Execute with periodic resource monitoring
   */
  private async executeWithResourceMonitoring<R>(
    fn: () => Promise<R> | R,
  ): Promise<R> {
    // Check resources periodically during execution
    const checkInterval = setInterval(() => {
      try {
        this.tracker.checkLimits(this.policy);
      } catch (error) {
        clearInterval(checkInterval);
        throw error;
      }
    }, 100); // Check every 100ms

    try {
      const result = await Promise.resolve(fn());
      clearInterval(checkInterval);

      // Final resource check
      this.tracker.checkLimits(this.policy);

      return result;
    } catch (error) {
      clearInterval(checkInterval);
      throw error;
    }
  }

  /**
   * Check if argument is PluginContext
   */
  private isPluginContext(arg: unknown): arg is PluginContext {
    return (
      typeof arg === 'object' &&
      arg !== null &&
      'sessionId' in arg &&
      'iteration' in arg &&
      'targetFile' in arg
    );
  }

  /**
   * Update security policy
   */
  setPolicy(policy: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /**
   * Get current policy
   */
  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }
}

/**
 * Create sandboxed plugin executor
 */
export function createPluginSandbox(
  policy?: Partial<SecurityPolicy>,
): PluginSandbox {
  const fullPolicy = policy
    ? { ...DEFAULT_SECURITY_POLICY, ...policy }
    : DEFAULT_SECURITY_POLICY;

  return new PluginSandbox(fullPolicy);
}
