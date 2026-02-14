/**
 * Error Categorizer
 *
 * Categorizes test failures into types:
 * - SYNTAX: Parse/compilation errors
 * - LOGIC: Assertion failures, incorrect behavior
 * - ENVIRONMENT: Missing dependencies, configuration issues
 * - FLAKY: Non-deterministic, timing-related
 * - PERFORMANCE: Timeout, resource exhaustion
 *
 * Helps MemoryVault index errors and retrieve similar fixes.
 *
 * @module memory/error-categorizer
 */

export type ErrorCategory =
  | 'SYNTAX'
  | 'LOGIC'
  | 'ENVIRONMENT'
  | 'FLAKY'
  | 'PERFORMANCE';

export interface CategorizedError {
  category: ErrorCategory;
  confidence: number;
  signature: string;
  message: string;
  context: string[];
  stackTrace?: string;
}

export interface ErrorPattern {
  pattern: RegExp;
  category: ErrorCategory;
  weight: number;
}

/**
 * Error categorizer
 */
export class ErrorCategorizer {
  private patterns: ErrorPattern[] = [];

  constructor() {
    this.initializePatterns();
  }

  /**
   * Categorize error from message and stack trace
   */
  categorize(
    message: string,
    stackTrace?: string,
    context?: string[]
  ): CategorizedError {
    const combined = `${message}\n${stackTrace || ''}`;
    const scores = this.calculateScores(combined);

    // Get category with highest score
    const category = this.getHighestScoringCategory(scores);
    const confidence = scores[category];

    // Create error signature
    const signature = this.createSignature(message, category);

    return {
      category,
      confidence,
      signature,
      message,
      context: context || [],
      stackTrace,
    };
  }

  /**
   * Calculate scores for each category
   */
  private calculateScores(text: string): Record<ErrorCategory, number> {
    const scores: Record<ErrorCategory, number> = {
      SYNTAX: 0,
      LOGIC: 0,
      ENVIRONMENT: 0,
      FLAKY: 0,
      PERFORMANCE: 0,
    };

    for (const { pattern, category, weight } of this.patterns) {
      if (pattern.test(text)) {
        scores[category] += weight;
      }
    }

    // Normalize scores
    const total = Object.values(scores).reduce((sum, s) => sum + s, 0);

    if (total > 0) {
      for (const key of Object.keys(scores) as ErrorCategory[]) {
        scores[key] /= total;
      }
    }

    return scores;
  }

  /**
   * Get category with highest score
   */
  private getHighestScoringCategory(
    scores: Record<ErrorCategory, number>
  ): ErrorCategory {
    let maxCategory: ErrorCategory = 'LOGIC';
    let maxScore = scores.LOGIC;

    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxCategory = category as ErrorCategory;
        maxScore = score;
      }
    }

    return maxCategory;
  }

  /**
   * Create error signature for indexing
   */
  createSignature(message: string, category: ErrorCategory): string {
    // Extract key parts of error message
    const normalized = message
      .toLowerCase()
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/'[^']*'/g, 'STR') // Replace string literals
      .replace(/"[^"]*"/g, 'STR')
      .replace(/`[^`]*`/g, 'CODE')
      .replace(/\s+/g, ' ')
      .trim();

    return `[${category}] ${normalized.substring(0, 100)}`;
  }

  /**
   * Initialize error patterns
   */
  private initializePatterns(): void {
    // SYNTAX patterns
    this.patterns.push(
      { pattern: /SyntaxError/i, category: 'SYNTAX', weight: 1.0 },
      { pattern: /ParseError/i, category: 'SYNTAX', weight: 1.0 },
      { pattern: /unexpected token/i, category: 'SYNTAX', weight: 0.9 },
      { pattern: /invalid syntax/i, category: 'SYNTAX', weight: 0.9 },
      { pattern: /unterminated/i, category: 'SYNTAX', weight: 0.8 },
      { pattern: /expected.*got/i, category: 'SYNTAX', weight: 0.7 },
      { pattern: /compilation error/i, category: 'SYNTAX', weight: 1.0 },
      { pattern: /type.*mismatch/i, category: 'SYNTAX', weight: 0.8 }
    );

    // LOGIC patterns
    this.patterns.push(
      { pattern: /AssertionError/i, category: 'LOGIC', weight: 1.0 },
      { pattern: /expected.*but.*got/i, category: 'LOGIC', weight: 0.9 },
      { pattern: /expected.*to (be|equal)/i, category: 'LOGIC', weight: 0.9 },
      { pattern: /assertion failed/i, category: 'LOGIC', weight: 1.0 },
      { pattern: /not equal/i, category: 'LOGIC', weight: 0.8 },
      { pattern: /incorrect/i, category: 'LOGIC', weight: 0.6 },
      { pattern: /wrong/i, category: 'LOGIC', weight: 0.5 },
      { pattern: /unexpected result/i, category: 'LOGIC', weight: 0.7 }
    );

    // ENVIRONMENT patterns
    this.patterns.push(
      { pattern: /module.*not found/i, category: 'ENVIRONMENT', weight: 1.0 },
      { pattern: /cannot find module/i, category: 'ENVIRONMENT', weight: 1.0 },
      { pattern: /import.*failed/i, category: 'ENVIRONMENT', weight: 0.9 },
      { pattern: /dependency.*missing/i, category: 'ENVIRONMENT', weight: 0.9 },
      { pattern: /ENOENT/i, category: 'ENVIRONMENT', weight: 0.8 },
      { pattern: /file not found/i, category: 'ENVIRONMENT', weight: 0.8 },
      { pattern: /permission denied/i, category: 'ENVIRONMENT', weight: 0.9 },
      { pattern: /connection refused/i, category: 'ENVIRONMENT', weight: 0.8 },
      { pattern: /ECONNREFUSED/i, category: 'ENVIRONMENT', weight: 0.9 },
      { pattern: /network.*error/i, category: 'ENVIRONMENT', weight: 0.7 }
    );

    // FLAKY patterns
    this.patterns.push(
      { pattern: /flaky/i, category: 'FLAKY', weight: 1.0 },
      { pattern: /intermittent/i, category: 'FLAKY', weight: 0.9 },
      { pattern: /race condition/i, category: 'FLAKY', weight: 1.0 },
      { pattern: /sometimes passes/i, category: 'FLAKY', weight: 0.9 },
      { pattern: /non-deterministic/i, category: 'FLAKY', weight: 1.0 },
      { pattern: /timing.*issue/i, category: 'FLAKY', weight: 0.8 },
      { pattern: /async.*timeout/i, category: 'FLAKY', weight: 0.7 }
    );

    // PERFORMANCE patterns
    this.patterns.push(
      { pattern: /timeout/i, category: 'PERFORMANCE', weight: 0.9 },
      { pattern: /timed out/i, category: 'PERFORMANCE', weight: 1.0 },
      { pattern: /exceeded.*time/i, category: 'PERFORMANCE', weight: 0.9 },
      { pattern: /too slow/i, category: 'PERFORMANCE', weight: 0.8 },
      { pattern: /out of memory/i, category: 'PERFORMANCE', weight: 1.0 },
      { pattern: /OOM/i, category: 'PERFORMANCE', weight: 0.9 },
      { pattern: /memory limit/i, category: 'PERFORMANCE', weight: 0.9 },
      { pattern: /heap.*overflow/i, category: 'PERFORMANCE', weight: 0.8 },
      { pattern: /stack overflow/i, category: 'PERFORMANCE', weight: 0.9 }
    );
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern: RegExp, category: ErrorCategory, weight: number = 1.0): void {
    this.patterns.push({ pattern, category, weight });
  }

  /**
   * Get category description
   */
  static getCategoryDescription(category: ErrorCategory): string {
    const descriptions: Record<ErrorCategory, string> = {
      SYNTAX: 'Syntax or compilation errors (parse failures, type mismatches)',
      LOGIC: 'Assertion failures or incorrect behavior (test expectations not met)',
      ENVIRONMENT:
        'Environment issues (missing dependencies, file not found, network errors)',
      FLAKY: 'Non-deterministic failures (race conditions, timing issues)',
      PERFORMANCE: 'Performance issues (timeouts, memory exhaustion)',
    };

    return descriptions[category];
  }

  /**
   * Get suggested fix strategy for category
   */
  static getFixStrategy(category: ErrorCategory): string[] {
    const strategies: Record<ErrorCategory, string[]> = {
      SYNTAX: [
        'Review syntax and type definitions',
        'Check language/framework version compatibility',
        'Verify import statements',
        'Fix compilation errors',
      ],
      LOGIC: [
        'Review test expectations',
        'Debug implementation logic',
        'Add edge case handling',
        'Fix assertion conditions',
      ],
      ENVIRONMENT: [
        'Install missing dependencies',
        'Check file paths and permissions',
        'Verify environment variables',
        'Fix configuration files',
      ],
      FLAKY: [
        'Add proper async/await handling',
        'Increase timeouts',
        'Add retry logic',
        'Fix race conditions with proper synchronization',
      ],
      PERFORMANCE: [
        'Optimize algorithm complexity',
        'Add resource cleanup',
        'Increase timeout limits',
        'Fix memory leaks',
      ],
    };

    return strategies[category];
  }

  /**
   * Determine if error is retriable
   */
  static isRetriable(category: ErrorCategory): boolean {
    return category === 'FLAKY' || category === 'ENVIRONMENT';
  }

  /**
   * Get priority level for category
   */
  static getPriority(category: ErrorCategory): 'high' | 'medium' | 'low' {
    const priorities: Record<ErrorCategory, 'high' | 'medium' | 'low'> = {
      SYNTAX: 'high', // Must fix to run
      LOGIC: 'high', // Core functionality broken
      ENVIRONMENT: 'medium', // Can often be worked around
      FLAKY: 'low', // Non-blocking, may pass on retry
      PERFORMANCE: 'medium', // Impacts usability
    };

    return priorities[category];
  }
}
