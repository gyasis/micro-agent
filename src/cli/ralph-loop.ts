#!/usr/bin/env node
/**
 * Ralph Loop CLI Entry Point
 *
 * Main command-line interface for the Ralph Loop 2026 multi-agent testing system.
 * Provides commands for running iterations, checking config, and managing sessions.
 *
 * @module cli/ralph-loop
 */

import { Command } from 'commander';
import { runCommand } from './commands/run';
import { configCommand } from './commands/config';
import { statusCommand } from './commands/status';
import { resetCommand } from './commands/reset';
import { createLogger } from '../utils/logger';

const logger = createLogger();

const program = new Command();

program
  .name('ralph-loop')
  .description('Ralph Loop 2026 - Multi-agent iterative testing system')
  .version('1.0.0');

/**
 * Run command - Main workflow
 */
program
  .command('run')
  .description('Run Ralph Loop iterations for a file or objective')
  .argument('<target>', 'Target file or objective to achieve')
  .option('-o, --objective <text>', 'Explicit objective (overrides target file inference)')
  .option('-t, --test <command>', 'Test command to run (e.g., "npm test")')
  .option('-f, --framework <name>', 'Test framework: vitest|jest|pytest|cargo|custom', 'vitest')
  .option('-i, --max-iterations <n>', 'Maximum iterations', '30')
  .option('-b, --max-budget <n>', 'Maximum cost in USD', '2.00')
  .option('-d, --max-duration <n>', 'Maximum duration in minutes', '15')
  .option('-c, --config <path>', 'Path to ralph.config.yaml')
  .option('--librarian <model>', 'Override Librarian model (e.g., gemini-2.0-pro)')
  .option('--artisan <model>', 'Override Artisan model (e.g., claude-sonnet-4.5)')
  .option('--critic <model>', 'Override Critic model (e.g., gpt-4.1-mini)')
  .option('--chaos <model>', 'Override Chaos model')
  .option('--no-adversarial', 'Skip adversarial testing')
  .option('--reset-frequency <n>', 'Context reset frequency (1=every iteration)', '1')
  .option('--verbose', 'Enable verbose logging')
  .action(async (target, options) => {
    try {
      await runCommand(target, options);
    } catch (error) {
      logger.error('Run command failed', error);
      process.exit(1);
    }
  });

/**
 * Config command - Validate and show configuration
 */
program
  .command('config')
  .description('Show or validate configuration')
  .option('-p, --path <path>', 'Path to config file')
  .option('--validate', 'Validate configuration only')
  .option('--show-defaults', 'Show default configuration')
  .action(async (options) => {
    try {
      await configCommand(options);
    } catch (error) {
      logger.error('Config command failed', error);
      process.exit(1);
    }
  });

/**
 * Status command - Show current session status
 */
program
  .command('status')
  .description('Show current session status and progress')
  .option('-s, --session <id>', 'Session ID to check')
  .option('--latest', 'Show latest session')
  .option('--all', 'Show all sessions')
  .action(async (options) => {
    try {
      await statusCommand(options);
    } catch (error) {
      logger.error('Status command failed', error);
      process.exit(1);
    }
  });

/**
 * Reset command - Clean up and reset state
 */
program
  .command('reset')
  .description('Reset Ralph Loop state')
  .option('-s, --session <id>', 'Reset specific session')
  .option('--all', 'Reset all sessions')
  .option('--memory', 'Clear memory vault')
  .option('-f, --force', 'Force reset without confirmation')
  .action(async (options) => {
    try {
      await resetCommand(options);
    } catch (error) {
      logger.error('Reset command failed', error);
      process.exit(1);
    }
  });

/**
 * Version command (built-in via .version())
 */

/**
 * Help command (built-in via .help())
 */

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
