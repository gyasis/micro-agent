/**
 * Cost Calculator - Centralized Token-to-Cost Conversion
 *
 * Calculates API costs based on model pricing and token usage.
 * Supports all LLM providers used in Ralph Loop 2026.
 *
 * @module llm/cost-calculator
 */

export interface ModelPricing {
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
}

/**
 * Model pricing database (as of 2026-02)
 * Sources: Anthropic, Google AI, OpenAI official pricing pages
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude models
  'claude-sonnet-4.5': {
    inputCostPer1kTokens: 0.003,
    outputCostPer1kTokens: 0.015,
  },
  'claude-opus-4': {
    inputCostPer1kTokens: 0.015,
    outputCostPer1kTokens: 0.075,
  },
  'claude-haiku-4': {
    inputCostPer1kTokens: 0.0008,
    outputCostPer1kTokens: 0.004,
  },

  // Google Gemini models
  'gemini-2.0-pro': {
    inputCostPer1kTokens: 0.001,
    outputCostPer1kTokens: 0.002,
  },
  'gemini-2.0-flash': {
    inputCostPer1kTokens: 0.0001,
    outputCostPer1kTokens: 0.0002,
  },

  // OpenAI GPT models
  'gpt-4.1-mini': {
    inputCostPer1kTokens: 0.0001,
    outputCostPer1kTokens: 0.0003,
  },
  'gpt-4o': {
    inputCostPer1kTokens: 0.0025,
    outputCostPer1kTokens: 0.01,
  },
  'gpt-4o-mini': {
    inputCostPer1kTokens: 0.00015,
    outputCostPer1kTokens: 0.0006,
  },
  'gpt-4-turbo': {
    inputCostPer1kTokens: 0.01,
    outputCostPer1kTokens: 0.03,
  },
  'gpt-4': {
    inputCostPer1kTokens: 0.03,
    outputCostPer1kTokens: 0.06,
  },
  'gpt-4-32k': {
    inputCostPer1kTokens: 0.06,
    outputCostPer1kTokens: 0.12,
  },
  'gpt-3.5-turbo': {
    inputCostPer1kTokens: 0.0005,
    outputCostPer1kTokens: 0.0015,
  },
  'gpt-3.5-turbo-16k': {
    inputCostPer1kTokens: 0.003,
    outputCostPer1kTokens: 0.004,
  },

  // Azure OpenAI models (same pricing as OpenAI in most regions)
  'azure/gpt-4': {
    inputCostPer1kTokens: 0.03,
    outputCostPer1kTokens: 0.06,
  },
  'azure/gpt-4-turbo': {
    inputCostPer1kTokens: 0.01,
    outputCostPer1kTokens: 0.03,
  },
  'azure/gpt-4-32k': {
    inputCostPer1kTokens: 0.06,
    outputCostPer1kTokens: 0.12,
  },
  'azure/gpt-3.5-turbo': {
    inputCostPer1kTokens: 0.0005,
    outputCostPer1kTokens: 0.0015,
  },
  'azure/gpt-3.5-turbo-16k': {
    inputCostPer1kTokens: 0.003,
    outputCostPer1kTokens: 0.004,
  },

  // Local models (free)
  ollama: {
    inputCostPer1kTokens: 0,
    outputCostPer1kTokens: 0,
  },
};

/**
 * Calculate cost for LLM API call
 *
 * @param model - Model name (e.g., 'claude-sonnet-4.5')
 * @param inputTokens - Number of input/prompt tokens
 * @param outputTokens - Number of output/completion tokens
 * @returns Cost in USD
 *
 * @example
 * ```typescript
 * const cost = calculateCost('claude-sonnet-4.5', 1000, 500);
 * console.log(`Cost: $${cost.toFixed(4)}`); // Cost: $0.0105
 * ```
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];

  if (!pricing) {
    // Unknown model - use conservative estimate
    console.warn(`Unknown model "${model}", using default pricing`);
    return ((inputTokens + outputTokens) / 1000) * 0.001;
  }

  const inputCost = (inputTokens / 1000) * pricing.inputCostPer1kTokens;
  const outputCost = (outputTokens / 1000) * pricing.outputCostPer1kTokens;

  return inputCost + outputCost;
}

/**
 * Calculate total cost from combined token count
 * Uses a simplified average rate for input+output
 *
 * @param model - Model name
 * @param totalTokens - Total tokens (input + output)
 * @returns Cost in USD
 */
export function calculateTotalCost(model: string, totalTokens: number): number {
  const pricing = MODEL_PRICING[model];

  if (!pricing) {
    console.warn(`Unknown model "${model}", using default pricing`);
    return (totalTokens / 1000) * 0.001;
  }

  // Use average of input and output rates as approximation
  const avgRate =
    (pricing.inputCostPer1kTokens + pricing.outputCostPer1kTokens) / 2;
  return (totalTokens / 1000) * avgRate;
}

/**
 * Get pricing information for a model
 *
 * @param model - Model name
 * @returns Pricing info or null if unknown
 */
export function getModelPricing(model: string): ModelPricing | null {
  return MODEL_PRICING[model] || null;
}

/**
 * Check if model has pricing information
 *
 * @param model - Model name
 * @returns True if pricing is known
 */
export function hasPricing(model: string): boolean {
  return model in MODEL_PRICING;
}

/**
 * Get all supported models
 *
 * @returns Array of model names with known pricing
 */
export function getSupportedModels(): string[] {
  return Object.keys(MODEL_PRICING);
}
