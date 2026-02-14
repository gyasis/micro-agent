/**
 * Structured Logger
 *
 * Provides consistent logging across Ralph Loop components with:
 * - Log levels (debug, info, warn, error)
 * - Structured JSON output
 * - Context tracking (session, iteration)
 * - Performance timing
 *
 * @module utils/logger
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  sessionId?: string;
  iteration?: number;
  agent?: string;
  phase?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  data?: any;
  duration?: number;
}

export class Logger {
  private context: LogContext;
  private minLevel: LogLevel;
  private logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(context: LogContext = {}, minLevel: LogLevel = 'info') {
    this.context = context;
    this.minLevel = minLevel;
  }

  /**
   * Create child logger with additional context
   */
  public child(additionalContext: LogContext): Logger {
    return new Logger(
      { ...this.context, ...additionalContext },
      this.minLevel
    );
  }

  /**
   * Log debug message
   */
  public debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  /**
   * Log info message
   */
  public info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  /**
   * Log warning
   */
  public warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  /**
   * Log error
   */
  public error(message: string, error?: Error | any): void {
    const data = error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : error;

    this.log('error', message, data);
  }

  /**
   * Start timing operation
   */
  public startTimer(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`${label} completed`, { duration });
    };
  }

  /**
   * Log with timing
   */
  public async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(`${label} completed`, { duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${label} failed`, { duration, error });
      throw error;
    }
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, data?: any): void {
    if (this.logLevels[level] < this.logLevels[this.minLevel]) {
      return; // Below minimum log level
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      data,
    };

    // Output based on level
    if (level === 'error') {
      console.error(this.format(entry));
    } else if (level === 'warn') {
      console.warn(this.format(entry));
    } else {
      console.log(this.format(entry));
    }
  }

  /**
   * Format log entry for output
   */
  private format(entry: LogEntry): string {
    const { timestamp, level, message, context, data } = entry;

    // Compact format for terminal
    const parts: string[] = [];

    // Timestamp (short format)
    const time = new Date(timestamp).toISOString().split('T')[1].split('.')[0];
    parts.push(`[${time}]`);

    // Level with color
    const levelStr = this.colorizeLevel(level);
    parts.push(levelStr);

    // Context (if present)
    if (context) {
      const ctx = this.formatContext(context);
      if (ctx) parts.push(`[${ctx}]`);
    }

    // Message
    parts.push(message);

    // Data (if present)
    if (data !== undefined) {
      if (typeof data === 'object') {
        parts.push(JSON.stringify(data));
      } else {
        parts.push(String(data));
      }
    }

    return parts.join(' ');
  }

  /**
   * Colorize log level
   */
  private colorizeLevel(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';

    return `${colors[level]}${level.toUpperCase()}${reset}`;
  }

  /**
   * Format context for display
   */
  private formatContext(context: LogContext): string {
    const parts: string[] = [];

    if (context.sessionId) {
      parts.push(`session:${context.sessionId.substring(0, 8)}`);
    }

    if (context.iteration !== undefined) {
      parts.push(`iter:${context.iteration}`);
    }

    if (context.agent) {
      parts.push(context.agent);
    }

    if (context.phase) {
      parts.push(context.phase);
    }

    return parts.join('|');
  }

  /**
   * Set minimum log level
   */
  public setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Get current context
   */
  public getContext(): LogContext {
    return { ...this.context };
  }
}

/**
 * Global logger instance
 */
let globalLogger: Logger | null = null;

/**
 * Get or create global logger
 */
export function getLogger(context?: LogContext): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(context);
  } else if (context) {
    return globalLogger.child(context);
  }
  return globalLogger;
}

/**
 * Create a new logger instance
 */
export function createLogger(context?: LogContext, minLevel?: LogLevel): Logger {
  return new Logger(context, minLevel);
}
