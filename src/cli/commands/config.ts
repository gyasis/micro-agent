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

export async function configCommand(options: ConfigCommandOptions = {}): Promise<void> {
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
    console.log(`  Librarian: ${config.models.librarian.model} (${config.models.librarian.provider})`);
    console.log(`  Artisan:   ${config.models.artisan.model} (${config.models.artisan.provider})`);
    console.log(`  Critic:    ${config.models.critic.model} (${config.models.critic.provider})`);
    console.log(`  Chaos:     ${config.models.chaos?.model || 'Same as Artisan'} (${config.models.chaos?.provider || config.models.artisan.provider})`);

    console.log('\nLimits:');
    console.log(`  Max Iterations: ${config.limits.maxIterations}`);
    console.log(`  Max Budget:     $${config.limits.maxBudget}`);
    console.log(`  Max Duration:   ${config.limits.maxDuration} minutes`);

    console.log('\nMemory:');
    console.log(`  Context Reset Frequency: ${config.memory.contextResetFrequency} iteration(s)`);
    console.log(`  Context Reset Threshold: ${config.memory.contextResetThreshold * 100}%`);
    console.log(`  Vault Type: ${config.memory.vaultType}`);

    console.log('\nTest:');
    console.log(`  Framework: ${config.test.framework}`);
    console.log(`  Command:   ${config.test.command}`);
    console.log(`  Timeout:   ${config.test.timeout}ms`);

    console.log('\nAPI Keys Status:');
    const keys = {
      'Anthropic': process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY,
      'Google/Gemini': process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
      'OpenAI': process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
      'Azure OpenAI': process.env.AZURE_OPENAI_KEY,
      'Ollama': process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    };

    for (const [provider, value] of Object.entries(keys)) {
      const status = value ? '✅' : '⚠️';
      console.log(`  ${status} ${provider}: ${value ? 'Configured' : 'Not set'}`);
    }

  } catch (error: any) {
    console.error('❌ Configuration error:', error.message);
    process.exit(1);
  }
}
