/**
 * Input Validation for CLI Arguments and Config Files
 *
 * Comprehensive validation to prevent injection attacks,
 * path traversal, and malformed inputs.
 *
 * @module utils/input-validator
 */

import path from 'path';
import { z } from 'zod';

/**
 * File path validator
 */
export class FilePathValidator {
  /**
   * Validate and sanitize file path
   */
  static validate(filePath: string, allowAbsolute: boolean = false): string {
    // Remove null bytes
    const sanitized = filePath.replace(/\0/g, '').trim();

    if (!sanitized) {
      throw new Error('File path cannot be empty');
    }

    // Check for path traversal
    if (sanitized.includes('..')) {
      throw new Error('Path traversal (..) is not allowed');
    }

    // Check for absolute paths if not allowed
    if (!allowAbsolute && path.isAbsolute(sanitized)) {
      throw new Error('Absolute paths are not allowed');
    }

    // Prevent access to sensitive directories
    const dangerous = [
      '/etc',
      '/root',
      '/home',
      '/usr/bin',
      '/bin',
      '/sbin',
      '/sys',
      '/proc',
    ];

    for (const dir of dangerous) {
      if (sanitized.startsWith(dir) || sanitized.startsWith('.' + dir)) {
        throw new Error(`Access to ${dir} is not allowed`);
      }
    }

    // Prevent hidden files (starting with .)
    const basename = path.basename(sanitized);
    if (basename.startsWith('.') && basename !== '.') {
      throw new Error('Hidden files are not allowed');
    }

    return sanitized;
  }

  /**
   * Validate file extension
   */
  static validateExtension(
    filePath: string,
    allowedExtensions: string[],
  ): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return allowedExtensions.map((e) => e.toLowerCase()).includes(ext);
  }

  /**
   * Sanitize file name
   */
  static sanitizeFileName(fileName: string): string {
    // Remove special characters except dash, underscore, dot
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}

/**
 * CLI argument validator
 */
export class CLIArgumentValidator {
  /**
   * Validate session ID
   */
  static validateSessionId(sessionId: string): string {
    const schema = z
      .string()
      .min(1, 'Session ID cannot be empty')
      .max(64, 'Session ID too long')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Session ID must be alphanumeric with - or _');

    return schema.parse(sessionId.trim());
  }

  /**
   * Validate iteration number
   */
  static validateIteration(iteration: number | string): number {
    const num =
      typeof iteration === 'string' ? parseInt(iteration, 10) : iteration;

    if (isNaN(num) || num < 1 || num > 1000) {
      throw new Error('Iteration must be a number between 1 and 1000');
    }

    return num;
  }

  /**
   * Validate cost limit
   */
  static validateCostLimit(cost: number | string): number {
    const num = typeof cost === 'string' ? parseFloat(cost) : cost;

    if (isNaN(num) || num < 0 || num > 1000) {
      throw new Error('Cost limit must be between 0 and 1000');
    }

    return num;
  }

  /**
   * Validate time limit (in minutes)
   */
  static validateTimeLimit(minutes: number | string): number {
    const num = typeof minutes === 'string' ? parseInt(minutes, 10) : minutes;

    if (isNaN(num) || num < 1 || num > 1440) {
      throw new Error(
        'Time limit must be between 1 and 1440 minutes (24 hours)',
      );
    }

    return num;
  }

  /**
   * Validate model name
   */
  static validateModelName(model: string): string {
    const allowedModels = [
      // Gemini models (Librarian)
      'gemini-2.0-pro',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      // Claude models (Artisan, Chaos)
      'claude-sonnet-4.5',
      'claude-sonnet-3.5',
      'claude-opus-4',
      'claude-opus-3.5',
      'claude-haiku-3.5',
      // OpenAI models (Critic)
      'gpt-4.1-mini',
      'gpt-4.1',
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-4o-mini',
    ];

    const sanitized = model.trim().toLowerCase();

    if (!allowedModels.includes(sanitized)) {
      throw new Error(
        `Invalid model name. Allowed: ${allowedModels.join(', ')}`,
      );
    }

    return sanitized;
  }

  /**
   * Validate config file path
   */
  static validateConfigPath(configPath: string): string {
    const sanitized = FilePathValidator.validate(configPath, true);

    // Must be JSON or YAML
    if (
      !FilePathValidator.validateExtension(sanitized, [
        '.json',
        '.yaml',
        '.yml',
      ])
    ) {
      throw new Error('Config file must be .json, .yaml, or .yml');
    }

    return sanitized;
  }
}

/**
 * Config validator with Zod schemas
 */
export class ConfigValidator {
  /**
   * Ralph config schema
   */
  private static ralphConfigSchema = z.object({
    maxIterations: z.number().int().min(1).max(1000).default(30),
    costLimit: z.number().min(0).max(1000).default(2.0),
    timeLimit: z.number().int().min(1).max(86400000).default(3600000), // milliseconds
    adversarialTesting: z
      .object({
        enabled: z.boolean().default(true),
        minCoverage: z.number().min(0).max(100).default(80),
        mutationScoreMin: z.number().min(0).max(100).default(80),
      })
      .default({ enabled: true, minCoverage: 80, mutationScoreMin: 80 }),
    contextWindow: z
      .object({
        maxTokens: z.number().int().min(1000).max(1000000).default(200000),
        resetThreshold: z.number().min(0).max(1).default(0.4),
      })
      .default({ maxTokens: 200000, resetThreshold: 0.4 }),
    agents: z
      .object({
        librarian: z
          .object({
            model: z.string().default('gemini-2.0-pro'),
            temperature: z.number().min(0).max(2).default(0.3),
          })
          .default({ model: 'gemini-2.0-pro', temperature: 0.3 }),
        artisan: z
          .object({
            model: z.string().default('claude-sonnet-4.5'),
            temperature: z.number().min(0).max(2).default(0.7),
          })
          .default({ model: 'claude-sonnet-4.5', temperature: 0.7 }),
        critic: z
          .object({
            model: z.string().default('gpt-4.1-mini'),
            temperature: z.number().min(0).max(2).default(0.2),
          })
          .default({ model: 'gpt-4.1-mini', temperature: 0.2 }),
        chaos: z
          .object({
            model: z.string().default('claude-sonnet-4.5'),
            temperature: z.number().min(0).max(2).default(0.9),
          })
          .default({ model: 'claude-sonnet-4.5', temperature: 0.9 }),
      })
      .default({
        librarian: { model: 'gemini-2.0-pro', temperature: 0.3 },
        artisan: { model: 'claude-sonnet-4.5', temperature: 0.7 },
        critic: { model: 'gpt-4.1-mini', temperature: 0.2 },
        chaos: { model: 'claude-sonnet-4.5', temperature: 0.9 },
      }),
    entropy: z
      .object({
        threshold: z.number().int().min(1).max(10).default(3),
        enabled: z.boolean().default(true),
      })
      .default({ threshold: 3, enabled: true }),
  });

  /**
   * Plugin config schema
   */
  private static pluginConfigSchema = z.object({
    plugin: z.string().min(1, 'Plugin name cannot be empty'),
    enabled: z.boolean().default(true),
    config: z
      .object({
        timeout: z.number().int().min(100).max(60000).optional(),
        failOnError: z.boolean().default(false),
        hooks: z.record(z.string(), z.boolean()).optional(),
      })
      .passthrough() // Allow additional properties
      .default({ failOnError: false }),
  });

  /**
   * Validate Ralph configuration
   */
  static validateRalphConfig(
    config: unknown,
  ): z.infer<typeof ConfigValidator.ralphConfigSchema> {
    try {
      return this.ralphConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map(
          (e: { path: PropertyKey[]; message: string }) =>
            `${(e.path as (string | number)[]).join('.')}: ${e.message}`,
        );
        throw new Error(`Config validation failed:\n${messages.join('\n')}`);
      }
      throw error;
    }
  }

  /**
   * Validate plugin configuration
   */
  static validatePluginConfig(
    config: unknown,
  ): z.infer<typeof ConfigValidator.pluginConfigSchema> {
    try {
      return this.pluginConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map(
          (e: { path: PropertyKey[]; message: string }) =>
            `${(e.path as (string | number)[]).join('.')}: ${e.message}`,
        );
        throw new Error(
          `Plugin config validation failed:\n${messages.join('\n')}`,
        );
      }
      throw error;
    }
  }

  /**
   * Validate plugins array
   */
  static validatePlugins(
    plugins: unknown,
  ): z.infer<typeof ConfigValidator.pluginConfigSchema>[] {
    if (!Array.isArray(plugins)) {
      throw new Error('Plugins must be an array');
    }

    return plugins.map((plugin, index) => {
      try {
        return this.validatePluginConfig(plugin);
      } catch (error) {
        throw new Error(
          `Plugin at index ${index}: ${(error as Error).message}`,
        );
      }
    });
  }
}

/**
 * Sanitize user input to prevent injection
 */
export class InputSanitizer {
  /**
   * Remove dangerous characters
   */
  static sanitize(input: string): string {
    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');

    // Remove control characters (except newline and tab)
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized.trim();
  }

  /**
   * Sanitize for shell execution (prevent command injection)
   */
  static sanitizeForShell(input: string): string {
    // Remove all shell metacharacters
    return input.replace(/[;&|`$(){}[\]<>\\!]/g, '');
  }

  /**
   * Sanitize for SQL (prevent SQL injection)
   * Note: This is basic sanitization. Use parameterized queries when possible.
   */
  static sanitizeForSQL(input: string): string {
    // Escape single quotes
    return input.replace(/'/g, "''");
  }

  /**
   * Escape HTML to prevent XSS
   */
  static escapeHTML(input: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };

    return input.replace(/[&<>"'/]/g, (char) => map[char]);
  }
}

/**
 * Validate environment variables
 */
export class EnvironmentValidator {
  /**
   * Validate API key format
   */
  static validateAPIKey(key: string, provider: string): string {
    const sanitized = key.trim();

    if (!sanitized) {
      throw new Error(`${provider} API key cannot be empty`);
    }

    // Minimum length check
    if (sanitized.length < 20) {
      throw new Error(`${provider} API key appears to be too short`);
    }

    // Check for placeholder values
    const placeholders = ['YOUR_API_KEY', 'REPLACE_ME', 'TODO', 'XXX'];
    for (const placeholder of placeholders) {
      if (sanitized.toUpperCase().includes(placeholder)) {
        throw new Error(`${provider} API key appears to be a placeholder`);
      }
    }

    return sanitized;
  }

  /**
   * Validate required environment variables
   */
  static validateRequired(vars: Record<string, string>): void {
    const missing = Object.entries(vars)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}`,
      );
    }
  }
}
