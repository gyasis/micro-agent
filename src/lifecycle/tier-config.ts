/**
 * Tier Configuration Loader and Validator
 * @module lifecycle/tier-config
 */

import { promises as fs } from 'fs';
import { z } from 'zod';
import type { TierEscalationConfig } from './types';

const TierModelsSchema = z.object({
  artisan:   z.string().min(1, 'artisan model is required'),
  librarian: z.string().min(1).optional(),
  critic:    z.string().min(1).optional(),
});

const TierConfigSchema = z.object({
  name:          z.string().min(1, 'tier name is required'),
  mode:          z.enum(['simple', 'full'], {
    errorMap: () => ({ message: "mode must be 'simple' or 'full'" }),
  }),
  maxIterations: z.number().int().min(1).max(100),
  models:        TierModelsSchema,
});

const TierGlobalSchema = z.object({
  auditDbPath:             z.string().optional(),
  maxTotalCostUsd:         z.number().positive().optional(),
  maxTotalDurationMinutes: z.number().positive().optional(),
});

export const TierEscalationConfigSchema = z.object({
  tiers:  z.array(TierConfigSchema).min(1, 'at least 1 tier required'),
  global: TierGlobalSchema.optional(),
});

export async function loadTierConfig(filePath: string): Promise<TierEscalationConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err: any) {
    throw new Error(`Tier config not found: ${filePath}\n  ${err.message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Tier config parse error in ${filePath}: ${err.message}`);
  }

  const result = TierEscalationConfigSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((e, i) => `  Error ${i + 1}: ${e.path.join('.')} — ${e.message}`)
      .join('\n');
    throw new Error(`Tier config invalid: ${filePath}\n${errors}\n\nFix the errors above and re-run.`);
  }

  return result.data as TierEscalationConfig;
}

export function validateTierConfig(config: unknown): string[] {
  const result = TierEscalationConfigSchema.safeParse(config);
  if (result.success) return [];
  return result.error.issues.map(
    (e) => `${e.path.join('.')}: ${e.message}`
  );
}
