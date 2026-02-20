/**
 * Built-in Default Configuration
 *
 * Provides sensible defaults when no ralph.config.yaml is found.
 * These defaults represent the GOLD STANDARD Ralph Loop configuration.
 *
 * @module config/defaults
 */

import type { RalphConfig } from './schema-validator';

/**
 * Default Ralph configuration
 * Based on 2026 best practices and research from plan.md
 */
export function getDefaults(): RalphConfig {
  return {
    models: {
      librarian: {
        provider: 'google',
        model: 'gemini-2.5-flash', // Stable workhorse model (Feb 2026)
        temperature: 0.3, // Low temp for context analysis
      },
      artisan: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.7, // Moderate temp for code generation
      },
      critic: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.2, // Low temp for logic review
      },
      chaos: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.9, // High temp for creative adversarial testing
      },
    },

    languages: {
      typescript: {
        testPattern: '**/*.test.ts',
        coverageTool: 'c8',
      },
      javascript: {
        testPattern: '**/*.test.js',
        coverageTool: 'c8',
      },
      python: {
        testPattern: 'test_*.py',
        coverageTool: 'coverage',
      },
      rust: {
        testPattern: '*_test.rs',
        coverageTool: 'cargo-tarpaulin',
      },
    },

    testing: {
      adversarialTests: true,
      propertyBasedTests: true,
      mutationTesting: true,
      boundaryValueTesting: true,
      raceConditionTesting: false, // Disabled by default (expensive)
    },

    successCriteria: {
      testsPass: true,
      adversarialTestsPass: true,
      coverageThreshold: 90,
      mutationScoreMin: 80,
    },

    budgets: {
      maxIterations: 30,
      maxCostUsd: 2.0,
      maxDurationMinutes: 15,
    },

    memory: {
      vectorDb: 'chromadb',
      embeddingModel: 'all-MiniLM-L6-v2',
      similarityThreshold: 0.85,
      maxPatterns: 1000,
      globalSharing: false,
      contextResetFrequency: 1, // GOLD STANDARD - fresh context every iteration
    },

    plugins: [],

    sandbox: {
      type: 'docker',
      memoryLimit: '2048m',
      timeoutSeconds: 300,
      networkMode: 'none',
    },
  };
}

/**
 * Get default model for specific agent
 */
export function getDefaultModel(
  agent: 'librarian' | 'artisan' | 'critic' | 'chaos',
): {
  provider: string;
  model: string;
  temperature: number;
} {
  const defaults = getDefaults();
  const config = defaults.models?.[agent];

  if (!config) {
    throw new Error(`No default configuration for agent: ${agent}`);
  }

  return {
    provider: config.provider,
    model: config.model,
    temperature: config.temperature || 0.7,
  };
}

/**
 * Get default budget constraints
 */
export function getDefaultBudgets(): {
  maxIterations: number;
  maxCostUsd: number;
  maxDurationMinutes: number;
} {
  const defaults = getDefaults();
  return (
    defaults.budgets || {
      maxIterations: 30,
      maxCostUsd: 2.0,
      maxDurationMinutes: 15,
    }
  );
}

/**
 * Get default success criteria
 */
export function getDefaultSuccessCriteria(): {
  testsPass: boolean;
  adversarialTestsPass: boolean;
  coverageThreshold: number;
  mutationScoreMin: number;
} {
  const defaults = getDefaults();
  const sc = defaults.successCriteria;
  return {
    testsPass: sc?.testsPass ?? true,
    adversarialTestsPass: sc?.adversarialTestsPass ?? true,
    coverageThreshold: sc?.coverageThreshold ?? 90,
    mutationScoreMin: sc?.mutationScoreMin ?? 80,
  };
}

/**
 * Get default context reset frequency
 * CRITICAL: Default is 1 (fresh context every iteration) - GOLD STANDARD
 */
export function getDefaultContextResetFrequency(): number {
  return 1; // Fresh context every iteration
}

/**
 * Get default entropy detection configuration (T058)
 *
 * Circuit breaker triggers at 3 identical errors
 * Adversarial test failures do NOT count toward entropy
 */
export function getDefaultEntropyConfig(): {
  threshold: number;
  windowSize: number;
  resetOnDifferentError: boolean;
} {
  return {
    threshold: 3,
    windowSize: 10,
    resetOnDifferentError: true,
  };
}
