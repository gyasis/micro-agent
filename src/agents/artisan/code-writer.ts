/**
 * Code Writer Utilities
 *
 * Utilities for safely modifying existing code files:
 * - Find and replace code blocks
 * - Insert code at specific locations
 * - Preserve formatting and comments
 * - Validate changes before writing
 *
 * @module agents/artisan/code-writer
 */

import { promises as fs } from 'fs';
import path from 'path';
import * as diff from 'diff';

export interface CodeModification {
  type: 'replace' | 'insert' | 'delete' | 'append';
  location?: CodeLocation;
  oldCode?: string;
  newCode: string;
  description: string;
}

export interface CodeLocation {
  file: string;
  line?: number;
  column?: number;
  pattern?: string | RegExp;
}

export interface ModificationResult {
  success: boolean;
  before: string;
  after: string;
  diff: string;
  error?: string;
}

/**
 * Apply modifications to a file
 */
export async function applyModifications(
  filePath: string,
  modifications: CodeModification[]
): Promise<ModificationResult> {
  try {
    const before = await fs.readFile(filePath, 'utf-8');
    let after = before;

    // Apply modifications in order
    for (const mod of modifications) {
      after = await applyModification(after, mod);
    }

    const diffText = createDiff(before, after);

    return {
      success: true,
      before,
      after,
      diff: diffText,
    };
  } catch (error) {
    return {
      success: false,
      before: '',
      after: '',
      diff: '',
      error: String(error),
    };
  }
}

/**
 * Apply a single modification
 */
async function applyModification(
  content: string,
  modification: CodeModification
): Promise<string> {
  switch (modification.type) {
    case 'replace':
      return replaceCode(content, modification);
    case 'insert':
      return insertCode(content, modification);
    case 'delete':
      return deleteCode(content, modification);
    case 'append':
      return appendCode(content, modification);
    default:
      throw new Error(`Unknown modification type: ${modification.type}`);
  }
}

/**
 * Replace code block
 */
function replaceCode(content: string, mod: CodeModification): string {
  if (!mod.oldCode) {
    throw new Error('oldCode required for replace operation');
  }

  // Normalize whitespace for matching
  const normalizedOld = normalizeWhitespace(mod.oldCode);
  const normalizedContent = normalizeWhitespace(content);

  const index = normalizedContent.indexOf(normalizedOld);
  if (index === -1) {
    throw new Error(`Could not find code to replace: ${mod.oldCode.substring(0, 50)}...`);
  }

  // Find actual position in original content
  const actualIndex = findActualPosition(content, mod.oldCode);

  return (
    content.substring(0, actualIndex) +
    mod.newCode +
    content.substring(actualIndex + mod.oldCode.length)
  );
}

/**
 * Insert code at location
 */
function insertCode(content: string, mod: CodeModification): string {
  if (!mod.location) {
    throw new Error('location required for insert operation');
  }

  const position = findPosition(content, mod.location);
  return content.substring(0, position) + mod.newCode + content.substring(position);
}

/**
 * Delete code block
 */
function deleteCode(content: string, mod: CodeModification): string {
  if (!mod.oldCode) {
    throw new Error('oldCode required for delete operation');
  }

  const index = content.indexOf(mod.oldCode);
  if (index === -1) {
    throw new Error(`Could not find code to delete: ${mod.oldCode.substring(0, 50)}...`);
  }

  return content.substring(0, index) + content.substring(index + mod.oldCode.length);
}

/**
 * Append code to end of file
 */
function appendCode(content: string, mod: CodeModification): string {
  const separator = content.endsWith('\n') ? '' : '\n';
  return content + separator + mod.newCode;
}

/**
 * Find position in content based on location
 */
function findPosition(content: string, location: CodeLocation): number {
  // By line number
  if (location.line !== undefined) {
    const lines = content.split('\n');
    let position = 0;

    for (let i = 0; i < Math.min(location.line, lines.length); i++) {
      position += lines[i].length + 1; // +1 for newline
    }

    return position;
  }

  // By pattern
  if (location.pattern) {
    const pattern = typeof location.pattern === 'string' ? location.pattern : location.pattern.source;
    const regex = new RegExp(pattern);
    const match = content.match(regex);

    if (!match || match.index === undefined) {
      throw new Error(`Pattern not found: ${pattern}`);
    }

    return match.index;
  }

  throw new Error('Either line or pattern must be specified in location');
}

/**
 * Normalize whitespace for matching
 */
function normalizeWhitespace(code: string): string {
  return code
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find actual position of code in original content
 */
function findActualPosition(content: string, code: string): number {
  // Try exact match first
  let index = content.indexOf(code);
  if (index !== -1) return index;

  // Try normalized match
  const normalizedCode = normalizeWhitespace(code);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const windowSize = code.split('\n').length;
    const window = lines.slice(i, i + windowSize).join('\n');
    const normalizedWindow = normalizeWhitespace(window);

    if (normalizedWindow === normalizedCode) {
      // Calculate position
      let position = 0;
      for (let j = 0; j < i; j++) {
        position += lines[j].length + 1;
      }
      return position;
    }
  }

  return -1;
}

/**
 * Create unified diff between before and after
 */
export function createDiff(before: string, after: string): string {
  const patch = diff.createPatch('file', before, after, 'before', 'after');
  return patch;
}

/**
 * Parse diff and get statistics
 */
export function getDiffStats(diffText: string): {
  additions: number;
  deletions: number;
  changes: number;
} {
  const lines = diffText.split('\n');
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return {
    additions,
    deletions,
    changes: additions + deletions,
  };
}

/**
 * Validate code modifications before applying
 */
export function validateModifications(
  modifications: CodeModification[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const mod of modifications) {
    // Check required fields
    if (!mod.newCode && mod.type !== 'delete') {
      errors.push(`Missing newCode for ${mod.type} operation`);
    }

    if ((mod.type === 'replace' || mod.type === 'delete') && !mod.oldCode) {
      errors.push(`Missing oldCode for ${mod.type} operation`);
    }

    if (mod.type === 'insert' && !mod.location) {
      errors.push('Missing location for insert operation');
    }

    // Validate code syntax (basic checks)
    if (mod.newCode) {
      const balanced = checkBracesBalance(mod.newCode);
      if (!balanced) {
        errors.push(`Unbalanced braces in modification: ${mod.description}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if braces are balanced in code
 */
function checkBracesBalance(code: string): boolean {
  let balance = 0;

  for (const char of code) {
    if (char === '{') balance++;
    if (char === '}') balance--;
    if (balance < 0) return false;
  }

  return balance === 0;
}

/**
 * Smart code replacement with fuzzy matching
 */
export async function smartReplace(
  filePath: string,
  oldCode: string,
  newCode: string,
  options?: {
    fuzzyMatch?: boolean;
    preserveIndentation?: boolean;
  }
): Promise<ModificationResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  const opts = { fuzzyMatch: true, preserveIndentation: true, ...options };

  let after = content;
  const actualOld = opts.fuzzyMatch
    ? findBestMatch(content, oldCode)
    : oldCode;

  if (!actualOld) {
    return {
      success: false,
      before: content,
      after: content,
      diff: '',
      error: 'Could not find matching code',
    };
  }

  // Preserve indentation
  if (opts.preserveIndentation) {
    const indentation = getIndentation(content, actualOld);
    after = content.replace(actualOld, indentCode(newCode, indentation));
  } else {
    after = content.replace(actualOld, newCode);
  }

  const diffText = createDiff(content, after);

  return {
    success: true,
    before: content,
    after,
    diff: diffText,
  };
}

/**
 * Find best fuzzy match for code block
 */
function findBestMatch(content: string, target: string): string | null {
  const normalizedTarget = normalizeWhitespace(target);
  const lines = content.split('\n');
  const targetLines = target.split('\n').length;

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (let i = 0; i < lines.length - targetLines + 1; i++) {
    const window = lines.slice(i, i + targetLines).join('\n');
    const normalizedWindow = normalizeWhitespace(window);

    const score = similarity(normalizedTarget, normalizedWindow);
    if (score > bestScore && score > 0.8) {
      bestScore = score;
      bestMatch = window;
    }
  }

  return bestMatch;
}

/**
 * Calculate similarity score between two strings
 */
function similarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Get indentation of code block in content
 */
function getIndentation(content: string, codeBlock: string): string {
  const index = content.indexOf(codeBlock);
  if (index === -1) return '';

  const lineStart = content.lastIndexOf('\n', index) + 1;
  const line = content.substring(lineStart, index);

  return line.match(/^\s*/)?.[0] || '';
}

/**
 * Indent code block
 */
function indentCode(code: string, indentation: string): string {
  return code
    .split('\n')
    .map((line, i) => (i === 0 ? line : indentation + line))
    .join('\n');
}

/**
 * Write modifications to disk atomically
 */
export async function writeModifications(
  filePath: string,
  modifications: CodeModification[]
): Promise<void> {
  const result = await applyModifications(filePath, modifications);

  if (!result.success) {
    throw new Error(`Failed to apply modifications: ${result.error}`);
  }

  // Atomic write
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, result.after, 'utf-8');
  await fs.rename(tempPath, filePath);
}
