import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { loadTierConfig, validateTierConfig } from '../../../src/lifecycle/tier-config';

const TMP_DIR = join('/tmp', 'tier-config-tests');

beforeAll(() => mkdirSync(TMP_DIR, { recursive: true }));
afterAll(() => rmSync(TMP_DIR, { recursive: true, force: true }));

function writeTmp(name: string, content: object): string {
  const p = join(TMP_DIR, name);
  writeFileSync(p, JSON.stringify(content), 'utf-8');
  return p;
}

describe('validateTierConfig', () => {
  it('returns empty array for valid config', () => {
    const config = {
      tiers: [{ name: 'local', mode: 'simple', maxIterations: 5, models: { artisan: 'llama3' } }],
    };
    expect(validateTierConfig(config)).toEqual([]);
  });

  it('returns error when tiers array is empty', () => {
    const errors = validateTierConfig({ tiers: [] });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('tiers');
  });

  it('returns error when artisan model missing', () => {
    const errors = validateTierConfig({
      tiers: [{ name: 'x', mode: 'simple', maxIterations: 3, models: {} }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns error for invalid mode', () => {
    const errors = validateTierConfig({
      tiers: [{ name: 'x', mode: 'turbo', maxIterations: 3, models: { artisan: 'm' } }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts optional librarian and critic', () => {
    const config = {
      tiers: [{
        name: 'full', mode: 'full', maxIterations: 10,
        models: { artisan: 'a', librarian: 'b', critic: 'c' },
      }],
    };
    expect(validateTierConfig(config)).toEqual([]);
  });
});

describe('loadTierConfig', () => {
  it('loads valid config file', async () => {
    const p = writeTmp('valid.json', {
      tiers: [{ name: 'local', mode: 'simple', maxIterations: 5, models: { artisan: 'llama3' } }],
    });
    const cfg = await loadTierConfig(p);
    expect(cfg.tiers).toHaveLength(1);
    expect(cfg.tiers[0].name).toBe('local');
  });

  it('throws on missing file', async () => {
    await expect(loadTierConfig('/nonexistent/path.json')).rejects.toThrow('Tier config not found');
  });

  it('throws on invalid JSON', async () => {
    const p = join(TMP_DIR, 'bad.json');
    writeFileSync(p, '{ invalid json }', 'utf-8');
    await expect(loadTierConfig(p)).rejects.toThrow('parse error');
  });

  it('throws on schema violation with descriptive message', async () => {
    const p = writeTmp('invalid-schema.json', { tiers: [] });
    await expect(loadTierConfig(p)).rejects.toThrow('Tier config invalid');
  });
});
