/**
 * Reset Command
 *
 * Reset Ralph Loop state and clean up sessions.
 *
 * @module cli/commands/reset
 */

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface ResetCommandOptions {
  all?: boolean;
  memory?: boolean;
  sessions?: boolean;
  confirm?: boolean;
}

export async function resetCommand(
  options: ResetCommandOptions = {},
): Promise<void> {
  try {
    console.log('🔄 Ralph Loop Reset\n');

    const resetAll = options.all || (!options.memory && !options.sessions);

    // Confirm destructive action
    if (!options.confirm && resetAll) {
      console.log('⚠️  This will delete all Ralph Loop data!\n');
      console.log('To confirm, run: ralph reset --confirm\n');
      return;
    }

    const projectRoot = process.cwd();
    const ralphDir = path.join(projectRoot, '.ralph');

    // Check if .ralph directory exists
    const exists = await fs
      .access(ralphDir)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      console.log('✅ No Ralph Loop data found (already clean)\n');
      return;
    }

    let cleaned: string[] = [];

    // Reset memory vault
    if (resetAll || options.memory) {
      const memoryPath = path.join(ralphDir, 'memory');
      try {
        await fs.rm(memoryPath, { recursive: true, force: true });
        cleaned.push('Memory vault');
        console.log('✅ Cleared memory vault');
      } catch (error) {
        // Ignore if doesn't exist
      }
    }

    // Reset sessions
    if (resetAll || options.sessions) {
      const sessionsPath = path.join(ralphDir, 'sessions');
      try {
        await fs.rm(sessionsPath, { recursive: true, force: true });
        cleaned.push('Session data');
        console.log('✅ Cleared session data');
      } catch (error) {
        // Ignore if doesn't exist
      }
    }

    // Reset context
    if (resetAll) {
      const contextPath = path.join(ralphDir, 'context');
      try {
        await fs.rm(contextPath, { recursive: true, force: true });
        cleaned.push('Context cache');
        console.log('✅ Cleared context cache');
      } catch (error) {
        // Ignore if doesn't exist
      }
    }

    // Recreate directory structure
    await fs.mkdir(path.join(ralphDir, 'memory'), { recursive: true });
    await fs.mkdir(path.join(ralphDir, 'sessions'), { recursive: true });
    await fs.mkdir(path.join(ralphDir, 'context'), { recursive: true });

    console.log('\n🎉 Reset complete!');
    console.log(`   Cleaned: ${cleaned.join(', ')}`);
    console.log('   Fresh Ralph Loop state restored\n');
  } catch (error: any) {
    console.error('❌ Reset failed:', error.message);
    process.exit(1);
  }
}
