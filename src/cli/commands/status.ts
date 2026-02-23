/**
 * Status Command
 *
 * Show current Ralph Loop session status and progress.
 *
 * @module cli/commands/status
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface StatusCommandOptions {
  verbose?: boolean;
  session?: string; // Specific session ID to show
}

interface SessionMetadata {
  sessionId: string;
  createdAt: string;
  projectRoot: string;
}

interface IterationState {
  iteration: number;
  timestamp: number;
  codebasHash: string;
  testResults: any | null;
  contextUsage: any;
  agentOutputs: any[];
}

interface SessionLogEntry {
  iteration: number;
  timestamp: number;
  event: string;
  data: any;
}

export async function statusCommand(
  options: StatusCommandOptions = {},
): Promise<void> {
  try {
    console.log('📊 Ralph Loop Status\n');

    const projectRoot = process.cwd();
    const ralphDir = path.join(projectRoot, '.ralph');

    // Check if .ralph directory exists
    const exists = await fs
      .access(ralphDir)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      console.log('⚠️  No Ralph Loop sessions found');
      console.log('   Run ralph-loop to start a new session\n');
      return;
    }

    // Find sessions
    const entries = await fs.readdir(ralphDir);
    const sessionDirs = entries.filter((name) => name.startsWith('session-'));

    if (sessionDirs.length === 0) {
      console.log('⚠️  No sessions found in .ralph directory\n');
      return;
    }

    // Get the session to display
    let targetSession: string;
    if (options.session) {
      // Specific session requested
      if (!sessionDirs.includes(`session-${options.session}`)) {
        console.error(`❌ Session ${options.session} not found\n`);
        console.log('Available sessions:');
        sessionDirs.forEach((dir) =>
          console.log(`   - ${dir.replace('session-', '')}`),
        );
        process.exit(1);
      }
      targetSession = `session-${options.session}`;
    } else {
      // Get most recent session
      const sessionStats = await Promise.all(
        sessionDirs.map(async (dir) => {
          const stat = await fs.stat(path.join(ralphDir, dir));
          return { dir, mtime: stat.mtime.getTime() };
        }),
      );
      sessionStats.sort((a, b) => b.mtime - a.mtime);
      targetSession = sessionStats[0].dir;
    }

    const sessionPath = path.join(ralphDir, targetSession);

    // Read session metadata
    const metadataPath = path.join(sessionPath, 'metadata.json');
    const metadata: SessionMetadata = JSON.parse(
      await fs.readFile(metadataPath, 'utf-8'),
    );

    console.log('📁 Session Information');
    console.log(`   ID: ${metadata.sessionId}`);
    console.log(`   Started: ${new Date(metadata.createdAt).toLocaleString()}`);
    console.log(`   Project: ${metadata.projectRoot}`);

    // Find latest iteration state
    const sessionFiles = await fs.readdir(sessionPath);
    const stateFiles = sessionFiles
      .filter((name) => name.match(/^iteration-(\d+)-state\.json$/))
      .map((name) => {
        const match = name.match(/^iteration-(\d+)-state\.json$/);
        return { name, iteration: parseInt(match![1]) };
      })
      .sort((a, b) => b.iteration - a.iteration);

    if (stateFiles.length === 0) {
      console.log('\n⚠️  No iterations found for this session\n');
      return;
    }

    const latestState: IterationState = JSON.parse(
      await fs.readFile(path.join(sessionPath, stateFiles[0].name), 'utf-8'),
    );

    console.log('\n📈 Progress');
    console.log(`   Current Iteration: ${latestState.iteration}`);
    console.log(
      `   Last Update: ${new Date(latestState.timestamp).toLocaleString()}`,
    );

    // Test results
    if (latestState.testResults) {
      console.log('\n✅ Test Results');
      const results = latestState.testResults;
      console.log(`   Status: ${results.status?.toUpperCase() || 'UNKNOWN'}`);
      if (results.totalTests !== undefined) {
        console.log(
          `   Tests: ${results.passedTests}/${results.totalTests} passed`,
        );
        if (results.failedTests > 0) {
          console.log(`   Failures: ${results.failedTests}`);
        }
        if (results.skippedTests > 0) {
          console.log(`   Skipped: ${results.skippedTests}`);
        }
      }
      if (results.duration !== undefined) {
        console.log(`   Duration: ${results.duration}ms`);
      }
      if (results.coverage) {
        console.log(
          `   Coverage: ${results.coverage.linePercentage?.toFixed(1)}% lines`,
        );
      }
    }

    // Agent outputs
    if (latestState.agentOutputs && latestState.agentOutputs.length > 0) {
      console.log('\n🤖 Agent Activity');
      const agentCounts = new Map<string, number>();
      let totalCost = 0;

      latestState.agentOutputs.forEach((output) => {
        const count = agentCounts.get(output.agent) || 0;
        agentCounts.set(output.agent, count + 1);
        if (output.cost) {
          totalCost += output.cost;
        }
      });

      agentCounts.forEach((count, agent) => {
        console.log(`   ${agent}: ${count} invocations`);
      });

      if (totalCost > 0) {
        console.log(`   Total Cost: $${totalCost.toFixed(4)}`);
      }
    }

    // Context usage
    if (latestState.contextUsage) {
      console.log('\n💾 Context Usage');
      const usage = latestState.contextUsage;
      console.log(`   Agent: ${usage.agent}`);
      console.log(`   Model: ${usage.model}`);
      console.log(
        `   Tokens: ${usage.totalTokens.toLocaleString()}/${usage.contextWindowSize.toLocaleString()}`,
      );
      console.log(`   Usage: ${usage.usagePercentage.toFixed(1)}%`);
    }

    // Read session log for recent activity
    const logPath = path.join(sessionPath, 'iterations.log');
    try {
      const logContent = await fs.readFile(logPath, 'utf-8');
      const logEntries: SessionLogEntry[] = logContent
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));

      if (options.verbose && logEntries.length > 0) {
        console.log('\n📜 Recent Activity');
        const recentEntries = logEntries.slice(-5).reverse();
        recentEntries.forEach((entry) => {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          console.log(
            `   [${time}] Iteration ${entry.iteration}: ${entry.event}`,
          );
        });
      }
    } catch (error) {
      // Log file might not exist yet
    }

    // Show other sessions if any
    if (sessionDirs.length > 1 && !options.session) {
      console.log('\n📂 Other Sessions');
      const otherSessions = sessionDirs.filter((dir) => dir !== targetSession);
      otherSessions.slice(0, 5).forEach((dir) => {
        console.log(`   - ${dir.replace('session-', '')}`);
      });
      if (otherSessions.length > 5) {
        console.log(`   ... and ${otherSessions.length - 5} more`);
      }
      console.log('\n   Use --session <id> to view a specific session');
    }

    console.log('');
  } catch (error: any) {
    console.error('❌ Status check failed:', error.message);
    process.exit(1);
  }
}
