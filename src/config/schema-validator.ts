/**
 * Configuration Schema Validator
 *
 * Zod schemas for ralph.config.yaml validation.
 * Ensures type safety and provides clear error messages.
 *
 * @module config/schema-validator
 */

import { z } from 'zod';

/**
 * Model configuration schema
 */
export const ModelConfigSchema = z.object({
  provider: z.enum(['anthropic', 'google', 'openai', 'ollama', 'azure']),
  model: z.string(),
  apiKey: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  baseUrl: z.string().url().optional(), // For Ollama or custom endpoints
});

/**
 * Agent model assignments
 */
export const AgentModelsSchema = z.object({
  librarian: ModelConfigSchema.optional(),
  artisan: ModelConfigSchema.optional(),
  critic: ModelConfigSchema.optional(),
  chaos: ModelConfigSchema.optional(),
  localGuard: ModelConfigSchema.optional(),
});

/**
 * Language-specific configuration
 */
export const LanguageConfigSchema = z.object({
  testFramework: z.string().optional(),
  testPattern: z.string().optional(),
  testCommand: z.string().optional(),
  coverageTool: z.string().optional(),
});

export const LanguagesConfigSchema = z.object({
  typescript: LanguageConfigSchema.optional(),
  javascript: LanguageConfigSchema.optional(),
  python: LanguageConfigSchema.optional(),
  rust: LanguageConfigSchema.optional(),
});

/**
 * Testing strategies
 */
export const TestingConfigSchema = z.object({
  adversarialTests: z.boolean().default(true),
  propertyBasedTests: z.boolean().default(true),
  mutationTesting: z.boolean().default(true),
  boundaryValueTesting: z.boolean().default(true),
  raceConditionTesting: z.boolean().default(false),
});

/**
 * Success criteria
 */
export const SuccessCriteriaSchema = z.object({
  testsPass: z.boolean().default(true),
  adversarialTestsPass: z.boolean().default(true),
  coverageThreshold: z.number().min(0).max(100).optional(),
  mutationScoreMin: z.number().min(0).max(100).optional(),
  linterErrors: z.boolean().optional(),
});

/**
 * Budget constraints
 */
export const BudgetConfigSchema = z.object({
  maxIterations: z.number().positive().default(30),
  maxCostUsd: z.number().positive().default(2.0),
  maxDurationMinutes: z.number().positive().default(15),
});

/**
 * Memory (MemoryVault) configuration
 */
export const MemoryConfigSchema = z.object({
  vectorDb: z.enum(['chromadb', 'lancedb']).default('chromadb'),
  embeddingModel: z.string().default('all-MiniLM-L6-v2'),
  similarityThreshold: z.number().min(0).max(1).default(0.85),
  maxPatterns: z.number().positive().default(1000),
  globalSharing: z.boolean().default(false),
  contextResetFrequency: z.number().positive().default(1),
});

/**
 * Plugin configuration
 */
export const PluginConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.any()).optional(),
});

export const PluginsConfigSchema = z.array(PluginConfigSchema).optional();

/**
 * Sandbox configuration
 */
export const SandboxConfigSchema = z.object({
  type: z.enum(['docker', 'webcontainers']).default('docker'),
  memoryLimit: z.string().default('2048m'),
  timeoutSeconds: z.number().positive().default(300),
  networkMode: z.enum(['none', 'bridge', 'host']).default('none'),
});

/**
 * Main Ralph configuration schema
 */
export const RalphConfigSchema = z.object({
  models: AgentModelsSchema.optional(),
  languages: LanguagesConfigSchema.optional(),
  testing: TestingConfigSchema.optional(),
  successCriteria: SuccessCriteriaSchema.optional(),
  budgets: BudgetConfigSchema.optional(),
  memory: MemoryConfigSchema.optional(),
  plugins: PluginsConfigSchema,
  sandbox: SandboxConfigSchema.optional(),
  tierConfigFile: z.string().optional(),
});

export type RalphConfig = z.infer<typeof RalphConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AgentModels = z.infer<typeof AgentModelsSchema>;
export type LanguageConfig = z.infer<typeof LanguageConfigSchema>;
export type TestingConfig = z.infer<typeof TestingConfigSchema>;
export type SuccessCriteria = z.infer<typeof SuccessCriteriaSchema>;
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

/**
 * Validate configuration
 */
export function validateConfig(config: unknown): RalphConfig {
  return RalphConfigSchema.parse(config);
}

/**
 * Validate with detailed error messages
 */
export function validateConfigWithErrors(config: unknown): {
  valid: boolean;
  config?: RalphConfig;
  errors?: string[];
} {
  const result = RalphConfigSchema.safeParse(config);

  if (result.success) {
    return { valid: true, config: result.data };
  }

  const errors = result.error.issues.map(
    (err: { path: PropertyKey[]; message: string }) =>
      `${(err.path as (string | number)[]).join('.')}: ${err.message}`,
  );

  return { valid: false, errors };
}
