/**
 * Git Working Tree Utilities
 *
 * Provides utilities for checking git repository state and tracking changes.
 * Used by state persister to create checksums of working tree state.
 *
 * @module utils/git-utils
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);

export interface GitStatus {
  branch: string;
  hasUncommittedChanges: boolean;
  hasUntrackedFiles: boolean;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
}

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
}

/**
 * Check if current directory is a git repository
 */
export async function isGitRepository(cwd?: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current git branch
 */
export async function getCurrentBranch(cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get full git status
 */
export async function getStatus(cwd?: string): Promise<GitStatus | null> {
  try {
    const branch = await getCurrentBranch(cwd);
    if (!branch) return null;

    const { stdout } = await execAsync('git status --porcelain', { cwd });
    const lines = stdout.trim().split('\n').filter(Boolean);

    const modifiedFiles: string[] = [];
    const untrackedFiles: string[] = [];
    const stagedFiles: string[] = [];

    for (const line of lines) {
      const status = line.substring(0, 2);
      const filepath = line.substring(3);

      // Staged changes (first character)
      if (status[0] === 'M' || status[0] === 'A' || status[0] === 'D') {
        stagedFiles.push(filepath);
      }

      // Unstaged changes (second character)
      if (status[1] === 'M') {
        modifiedFiles.push(filepath);
      }

      // Untracked files
      if (status === '??') {
        untrackedFiles.push(filepath);
      }
    }

    return {
      branch,
      hasUncommittedChanges: modifiedFiles.length > 0 || stagedFiles.length > 0,
      hasUntrackedFiles: untrackedFiles.length > 0,
      modifiedFiles,
      untrackedFiles,
      stagedFiles,
    };
  } catch {
    return null;
  }
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(cwd?: string): Promise<boolean> {
  const status = await getStatus(cwd);
  return status?.hasUncommittedChanges ?? false;
}

/**
 * Get list of modified files
 */
export async function getModifiedFiles(cwd?: string): Promise<string[]> {
  const status = await getStatus(cwd);
  return status?.modifiedFiles ?? [];
}

/**
 * Get list of staged files
 */
export async function getStagedFiles(cwd?: string): Promise<string[]> {
  const status = await getStatus(cwd);
  return status?.stagedFiles ?? [];
}

/**
 * Get list of untracked files
 */
export async function getUntrackedFiles(cwd?: string): Promise<string[]> {
  const status = await getStatus(cwd);
  return status?.untrackedFiles ?? [];
}

/**
 * Get all changed files (modified + staged + untracked)
 */
export async function getAllChangedFiles(
  cwd?: string,
): Promise<GitFileStatus[]> {
  const status = await getStatus(cwd);
  if (!status) return [];

  const files: GitFileStatus[] = [];

  for (const path of status.stagedFiles) {
    files.push({ path, status: 'added' });
  }

  for (const path of status.modifiedFiles) {
    files.push({ path, status: 'modified' });
  }

  for (const path of status.untrackedFiles) {
    files.push({ path, status: 'untracked' });
  }

  return files;
}

/**
 * Create checksum of working tree state
 * Uses git ls-tree for committed files and status for uncommitted
 */
export async function getWorkingTreeChecksum(
  cwd?: string,
): Promise<string | null> {
  try {
    // Get tree hash of committed state
    const { stdout: treeHash } = await execAsync('git write-tree', { cwd });

    // Get status of uncommitted changes
    const { stdout: statusOutput } = await execAsync('git status --porcelain', {
      cwd,
    });

    // Combine for comprehensive checksum
    const combined = `${treeHash.trim()}\n${statusOutput}`;

    return crypto.createHash('sha256').update(combined).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Get commit hash of HEAD
 */
export async function getHeadCommit(cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get short commit hash of HEAD
 */
export async function getShortHeadCommit(cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --short HEAD', { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get commit message of HEAD
 */
export async function getHeadCommitMessage(
  cwd?: string,
): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git log -1 --pretty=%B', { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get repository root directory
 */
export async function getRepoRoot(cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', {
      cwd,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Check if working tree is clean (no uncommitted changes)
 */
export async function isWorkingTreeClean(cwd?: string): Promise<boolean> {
  const status = await getStatus(cwd);
  if (!status) return false;

  return !status.hasUncommittedChanges && !status.hasUntrackedFiles;
}

/**
 * Get diff of uncommitted changes
 */
export async function getDiff(cwd?: string): Promise<string | null> {
  try {
    // Get both staged and unstaged changes
    const { stdout: staged } = await execAsync('git diff --cached', { cwd });
    const { stdout: unstaged } = await execAsync('git diff', { cwd });

    return `${staged}\n${unstaged}`.trim();
  } catch {
    return null;
  }
}

/**
 * Get diff statistics
 */
export async function getDiffStats(cwd?: string): Promise<{
  filesChanged: number;
  insertions: number;
  deletions: number;
} | null> {
  try {
    const { stdout } = await execAsync('git diff --stat', { cwd });

    // Parse output like: " 2 files changed, 45 insertions(+), 12 deletions(-)"
    const match = stdout.match(
      /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/,
    );

    if (!match) return null;

    return {
      filesChanged: parseInt(match[1], 10),
      insertions: match[2] ? parseInt(match[2], 10) : 0,
      deletions: match[3] ? parseInt(match[3], 10) : 0,
    };
  } catch {
    return null;
  }
}
