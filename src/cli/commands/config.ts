/**
 * Config Command
 *
 * Show or validate Ralph Loop configuration.
 *
 * @module cli/commands/config
 */

import { ConfigLoader } from '../../config/config-loader';
import { validateConfig } from '../../config/schema-validator';

export interface ConfigCommandOptions {
  validate?: boolean;
  show?: boolean;
  path?: string;
}

export async function configCommand(
  options: ConfigCommandOptions = {},
): Promise<void> {
  try {
    console.log('🔧 Ralph Loop Configuration\n');

    const loader = new ConfigLoader({
      configPath: options.path,
      skipValidation: false,
    });

    const config = await loader.load();

    if (options.validate) {
      // Validate config
      console.log('✅ Configuration is valid!\n');
      console.log('Schema validation passed.');
      return;
    }

    // Show config
    console.log('📋 Active Configuration:\n');
    console.log('Models:');
    console.log(
      `  Librarian: ${config.models?.librarian?.model ?? 'gemini-2.5-flash'} (${config.models?.librarian?.provider ?? 'google'})`,
    );
    console.log(
      `  Artisan:   ${config.models?.artisan?.model ?? 'claude-sonnet-4-20250514'} (${config.models?.artisan?.provider ?? 'anthropic'})`,
    );
    console.log(
      `  Critic:    ${config.models?.critic?.model ?? 'gpt-4o-mini'} (${config.models?.critic?.provider ?? 'openai'})`,
    );
    console.log(
      `  Chaos:     ${config.models?.chaos?.model ?? 'Same as Artisan'} (${config.models?.chaos?.provider ?? config.models?.artisan?.provider ?? 'anthropic'})`,
    );

    console.log('\nLimits:');
    console.log(`  Max Iterations: ${config.budgets?.maxIterations ?? 30}`);
    console.log(`  Max Budget:     $${config.budgets?.maxCostUsd ?? 2.0}`);
    console.log(
      `  Max Duration:   ${config.budgets?.maxDurationMinutes ?? 15} minutes`,
    );

    console.log('\nMemory:');
    console.log(
      `  Context Reset Frequency: ${config.memory?.contextResetFrequency ?? 1} iteration(s)`,
    );
    console.log(`  Context Reset Threshold: 40%`);
    console.log(`  Vault Type: ${config.memory?.vectorDb ?? 'lancedb'}`);

    console.log('\nTest:');
    console.log(`  Framework: vitest`);
    console.log(`  Command:   npm test`);
    console.log(`  Timeout:   30000ms`);

    console.log('\nAPI Keys Status:');
    const keys = {
      Anthropic: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY,
      'Google/Gemini': process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
      OpenAI: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
      'Azure OpenAI': process.env.AZURE_OPENAI_KEY,
      Ollama: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    };

    for (const [provider, value] of Object.entries(keys)) {
      const status = value ? '✅' : '⚠️';
      console.log(
        `  ${status} ${provider}: ${value ? 'Configured' : 'Not set'}`,
      );
    }
  } catch (error: any) {
    console.error('❌ Configuration error:', error.message);
    process.exit(1);
  }
}
