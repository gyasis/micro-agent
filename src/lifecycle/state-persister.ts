/**
 * State Persister - Disk Write Operations Between Iterations
 *
 * Persists all state changes to disk before exiting iteration:
 * - Code changes written to files (git working tree)
 * - Test results saved to .ralph/session-{id}/test-results-iteration-{N}.json
 * - MemoryVault updated (handled by memory module)
 * - Session log appended to .ralph/session-{id}/iterations.log
 *
 * The disk IS the memory between iterations - not in-session context.
 *
 * @module lifecycle/state-persister
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { SessionLogEntry, IterationState } from './types';
import type { RalphTestResult } from '../parsers/base-parser';

export interface PersistOptions {
  sessionId: string;
  projectRoot: string;
  ralphDir?: string; // Default: .ralph
}

export interface PersistResult {
  success: boolean;
  filesWritten: string[];
  errors: string[];
}

export class StatePersister {
  private sessionId: string;
  private projectRoot: string;
  private ralphDir: string;
  private sessionDir: string;

  constructor(options: PersistOptions) {
    this.sessionId = options.sessionId;
    this.projectRoot = options.projectRoot;
    this.ralphDir = path.join(this.projectRoot, options.ralphDir || '.ralph');
    this.sessionDir = path.join(this.ralphDir, `session-${this.sessionId}`);
  }

  /**
   * Initialize session directory structure
   */
  public async initialize(): Promise<void> {
    await fs.mkdir(this.sessionDir, { recursive: true });
    await fs.mkdir(path.join(this.sessionDir, 'checkpoints'), { recursive: true });

    // Create session metadata file
    const metadata = {
      sessionId: this.sessionId,
      createdAt: new Date().toISOString(),
      projectRoot: this.projectRoot,
    };
    await fs.writeFile(
      path.join(this.sessionDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
  }

  /**
   * Persist test results for an iteration (T050)
   *
   * Saves unified ralph-test-json format to disk
   */
  public async persistTestResults(
    iteration: number,
    results: RalphTestResult
  ): Promise<string> {
    const filename = `test-results-iteration-${iteration}.json`;
    const filepath = path.join(this.sessionDir, filename);

    await fs.writeFile(filepath, JSON.stringify(results, null, 2));
    return filepath;
  }

  /**
   * Append entry to session iteration log
   */
  public async appendLog(entry: SessionLogEntry): Promise<void> {
    const logPath = path.join(this.sessionDir, 'iterations.log');
    const logLine = JSON.stringify(entry) + '\n';

    await fs.appendFile(logPath, logLine);
  }

  /**
   * Save iteration state to disk
   */
  public async persistIterationState(state: IterationState): Promise<string> {
    const filename = `iteration-${state.iteration}-state.json`;
    const filepath = path.join(this.sessionDir, filename);

    await fs.writeFile(filepath, JSON.stringify(state, null, 2));
    return filepath;
  }

  /**
   * Write code changes to files
   */
  public async persistCodeChanges(
    changes: Map<string, string>
  ): Promise<PersistResult> {
    const filesWritten: string[] = [];
    const errors: string[] = [];

    for (const [filepath, content] of changes.entries()) {
      try {
        const absolutePath = path.join(this.projectRoot, filepath);
        const dir = path.dirname(absolutePath);

        // Ensure directory exists
        await fs.mkdir(dir, { recursive: true });

        // Write file atomically
        const tempPath = absolutePath + '.tmp';
        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, absolutePath);

        filesWritten.push(filepath);
      } catch (error) {
        errors.push(`Failed to write ${filepath}: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      filesWritten,
      errors,
    };
  }

  /**
   * Create checkpoint snapshot of current state
   */
  public async createCheckpoint(
    iteration: number,
    description: string
  ): Promise<string> {
    const checkpointDir = path.join(
      this.sessionDir,
      'checkpoints',
      `iteration-${iteration}`
    );
    await fs.mkdir(checkpointDir, { recursive: true });

    const checkpoint = {
      iteration,
      timestamp: new Date().toISOString(),
      description,
    };

    const filepath = path.join(checkpointDir, 'checkpoint.json');
    await fs.writeFile(filepath, JSON.stringify(checkpoint, null, 2));

    return filepath;
  }

  /**
   * Load test results from previous iteration
   */
  public async loadTestResults(iteration: number): Promise<RalphTestResult | null> {
    const filename = `test-results-iteration-${iteration}.json`;
    const filepath = path.join(this.sessionDir, filename);

    try {
      const content = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null; // No results from previous iteration
    }
  }

  /**
   * Load iteration state
   */
  public async loadIterationState(iteration: number): Promise<IterationState | null> {
    const filename = `iteration-${iteration}-state.json`;
    const filepath = path.join(this.sessionDir, filename);

    try {
      const content = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Read session log entries
   */
  public async readLog(): Promise<SessionLogEntry[]> {
    const logPath = path.join(this.sessionDir, 'iterations.log');

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    } catch (error) {
      return []; // No log yet
    }
  }

  /**
   * Get session directory path
   */
  public getSessionDir(): string {
    return this.sessionDir;
  }

  /**
   * Clean up old session data (keep only last N sessions)
   */
  public async cleanup(keepLast: number = 10): Promise<void> {
    const sessions = await fs.readdir(this.ralphDir);
    const sessionDirs = sessions
      .filter((name) => name.startsWith('session-'))
      .map((name) => ({
        name,
        path: path.join(this.ralphDir, name),
      }));

    // Sort by creation time (oldest first)
    const sorted = await Promise.all(
      sessionDirs.map(async (dir) => {
        const stat = await fs.stat(dir.path);
        return { ...dir, mtime: stat.mtime.getTime() };
      })
    );
    sorted.sort((a, b) => a.mtime - b.mtime);

    // Delete old sessions
    const toDelete = sorted.slice(0, -keepLast);
    for (const dir of toDelete) {
      await fs.rm(dir.path, { recursive: true, force: true });
    }
  }
}

/**
 * Factory function to create state persister
 */
export function createStatePersister(options: PersistOptions): StatePersister {
  return new StatePersister(options);
}
