/**
 * Atomic File I/O Utilities
 *
 * Provides safe file operations with atomic writes to prevent corruption.
 * Used by state persister for reliable disk operations.
 *
 * @module utils/file-io
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Atomically write to a file
 * Writes to temp file first, then renames to target
 */
export async function writeFileAtomic(
  filepath: string,
  content: string | Buffer,
  encoding: BufferEncoding = 'utf-8'
): Promise<void> {
  const dir = path.dirname(filepath);
  const tempPath = path.join(dir, `.${path.basename(filepath)}.tmp.${Date.now()}`);

  try {
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write to temp file
    await fs.writeFile(tempPath, content, encoding);

    // Atomic rename
    await fs.rename(tempPath, filepath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Read file with error handling
 */
export async function readFileSafe(
  filepath: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<string | null> {
  try {
    return await fs.readFile(filepath, encoding);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // File doesn't exist
    }
    throw error;
  }
}

/**
 * Read JSON file
 */
export async function readJSON<T = any>(filepath: string): Promise<T | null> {
  const content = await readFileSafe(filepath);
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${filepath}: ${error}`);
  }
}

/**
 * Write JSON file atomically
 */
export async function writeJSON(
  filepath: string,
  data: any,
  pretty: boolean = true
): Promise<void> {
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeFileAtomic(filepath, content);
}

/**
 * Append to file
 */
export async function appendFile(filepath: string, content: string): Promise<void> {
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(filepath, content, 'utf-8');
}

/**
 * Check if file exists
 */
export async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if directory exists
 */
export async function directoryExists(dirpath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirpath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists
 */
export async function ensureDir(dirpath: string): Promise<void> {
  await fs.mkdir(dirpath, { recursive: true });
}

/**
 * Copy file
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  const destDir = path.dirname(dest);
  await ensureDir(destDir);
  await fs.copyFile(src, dest);
}

/**
 * Move file
 */
export async function moveFile(src: string, dest: string): Promise<void> {
  const destDir = path.dirname(dest);
  await ensureDir(destDir);
  await fs.rename(src, dest);
}

/**
 * Delete file safely (no error if doesn't exist)
 */
export async function deleteFile(filepath: string): Promise<void> {
  try {
    await fs.unlink(filepath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Delete directory recursively
 */
export async function deleteDirectory(dirpath: string): Promise<void> {
  try {
    await fs.rm(dirpath, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * List files in directory
 */
export async function listFiles(dirpath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirpath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Get file stats
 */
export async function getFileStats(filepath: string): Promise<{
  size: number;
  created: Date;
  modified: Date;
  isFile: boolean;
  isDirectory: boolean;
} | null> {
  try {
    const stats = await fs.stat(filepath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Calculate file hash (for change detection)
 */
export async function getFileHash(filepath: string): Promise<string | null> {
  const content = await readFileSafe(filepath);
  if (!content) return null;

  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Read multiple files in parallel
 */
export async function readFiles(
  filepaths: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  const promises = filepaths.map(async (filepath) => {
    const content = await readFileSafe(filepath);
    if (content !== null) {
      results.set(filepath, content);
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Write multiple files atomically
 */
export async function writeFiles(
  files: Map<string, string>
): Promise<{ succeeded: string[]; failed: Array<{ path: string; error: string }> }> {
  const succeeded: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  const promises = Array.from(files.entries()).map(async ([filepath, content]) => {
    try {
      await writeFileAtomic(filepath, content);
      succeeded.push(filepath);
    } catch (error) {
      failed.push({
        path: filepath,
        error: String(error),
      });
    }
  });

  await Promise.all(promises);
  return { succeeded, failed };
}
