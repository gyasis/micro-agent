/**
 * Rust Module Parser (T052)
 *
 * Parses Rust files to extract module dependencies.
 * Uses regex-based parsing initially, with tree-sitter support planned.
 *
 * Handles:
 * - use statements (use std::collections::HashMap)
 * - mod declarations (mod tests)
 * - pub use re-exports (pub use crate::module::Item)
 * - External crate imports (use external_crate::module)
 *
 * @module agents/librarian/rust-module-parser
 */

import path from 'path';
import { promises as fs } from 'fs';
import type {
  DependencyInfo,
  ImportInfo,
  ExportInfo,
} from './dependency-graph';

/**
 * Rust-specific import information
 */
export interface RustImportInfo extends ImportInfo {
  visibility?: 'public' | 'private' | 'crate' | 'super';
  isCrate?: boolean; // External crate
  isStd?: boolean; // Standard library
}

/**
 * Parse Rust file dependencies
 *
 * Extracts:
 * - use statements
 * - mod declarations
 * - pub use re-exports
 * - External crate dependencies
 */
export async function parseRustDependencies(
  filePath: string,
  rootDir: string,
): Promise<DependencyInfo> {
  const content = await fs.readFile(filePath, 'utf-8');

  // Remove comments to simplify parsing
  const cleanContent = removeRustComments(content);

  const imports = parseRustUseStatements(cleanContent);
  const modules = parseRustModDeclarations(cleanContent);
  const exports = parseRustExports(cleanContent);

  // Resolve module paths
  const resolvedImports = await resolveRustModules(
    imports,
    modules,
    filePath,
    rootDir,
  );

  // Extract dependencies
  const dependencies = resolvedImports
    .filter((imp) => imp.resolved)
    .map((imp) => imp.resolved!);

  const info: DependencyInfo = {
    file: path.relative(rootDir, filePath),
    imports: resolvedImports,
    exports,
    dependencies,
    dependents: [], // Filled by buildDependencyGraph
  };

  return info;
}

/**
 * Remove Rust comments from source code
 */
function removeRustComments(content: string): string {
  // Remove single-line comments
  let clean = content.replace(/\/\/.*/g, '');

  // Remove multi-line comments (simple approach, may fail on nested comments)
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');

  return clean;
}

/**
 * Parse Rust use statements
 *
 * Examples:
 * - use std::collections::HashMap;
 * - use crate::module::Item;
 * - use super::parent_module;
 * - use self::child_module;
 * - pub use external_crate::{Item1, Item2};
 * - use std::io::{self, Read, Write};
 */
function parseRustUseStatements(content: string): RustImportInfo[] {
  const imports: RustImportInfo[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match use statement
    const useMatch = trimmed.match(/^(pub\s+)?use\s+(.+?);/);
    if (!useMatch) continue;

    const isPublic = !!useMatch[1];
    const usePath = useMatch[2].trim();

    // Parse the use path
    const parsed = parseRustUsePath(usePath, isPublic);
    imports.push(...parsed);
  }

  return imports;
}

/**
 * Parse a Rust use path
 */
function parseRustUsePath(
  usePath: string,
  isPublic: boolean,
): RustImportInfo[] {
  const imports: RustImportInfo[] = [];

  // Handle grouped imports: use std::io::{Read, Write};
  const groupMatch = usePath.match(/^(.+?)::(\{.+\})$/);
  if (groupMatch) {
    const basePath = groupMatch[1];
    const group = groupMatch[2];

    // Extract names from group
    const names = group
      .slice(1, -1) // Remove { }
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n);

    for (const name of names) {
      const fullPath = name === 'self' ? basePath : `${basePath}::${name}`;
      imports.push(createRustImport(fullPath, name, isPublic));
    }

    return imports;
  }

  // Simple use statement
  imports.push(createRustImport(usePath, usePath.split('::').pop()!, isPublic));

  return imports;
}

/**
 * Create RustImportInfo from use path
 */
function createRustImport(
  fullPath: string,
  name: string,
  isPublic: boolean,
): RustImportInfo {
  const parts = fullPath.split('::');
  const firstPart = parts[0];

  // Determine import type
  const isStd =
    firstPart === 'std' || firstPart === 'core' || firstPart === 'alloc';
  const isCrate = firstPart === 'crate';
  const isSuper = firstPart === 'super';
  const isSelf = firstPart === 'self';

  let module = fullPath;

  // Normalize module path
  if (isCrate) {
    module = parts.slice(1).join('::'); // Remove 'crate::' prefix
  } else if (isSuper || isSelf) {
    module = fullPath; // Keep as-is for resolution
  }

  return {
    module,
    namedImports: [name],
    isTypeOnly: false,
    visibility: isPublic ? 'public' : 'private',
    isCrate,
    isStd,
  };
}

/**
 * Parse Rust mod declarations
 *
 * Examples:
 * - mod tests;
 * - pub mod utils;
 * - mod inner { ... }
 */
function parseRustModDeclarations(content: string): string[] {
  const modules: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match mod declaration
    const modMatch = trimmed.match(/^(?:pub\s+)?mod\s+(\w+)(?:\s*;|\s*\{)/);
    if (modMatch) {
      modules.push(modMatch[1]);
    }
  }

  return modules;
}

/**
 * Parse Rust exports (pub items)
 *
 * Extracts:
 * - pub fn functions
 * - pub struct types
 * - pub enum types
 * - pub const constants
 * - pub use re-exports
 */
function parseRustExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Only consider pub items
    if (!trimmed.startsWith('pub ')) continue;

    // Function
    const fnMatch = trimmed.match(/^pub\s+(?:async\s+)?fn\s+(\w+)/);
    if (fnMatch) {
      exports.push({
        name: fnMatch[1],
        kind: 'function',
        isDefault: false,
        isTypeOnly: false,
      });
      continue;
    }

    // Struct
    const structMatch = trimmed.match(/^pub\s+struct\s+(\w+)/);
    if (structMatch) {
      exports.push({
        name: structMatch[1],
        kind: 'class',
        isDefault: false,
        isTypeOnly: false,
      });
      continue;
    }

    // Enum
    const enumMatch = trimmed.match(/^pub\s+enum\s+(\w+)/);
    if (enumMatch) {
      exports.push({
        name: enumMatch[1],
        kind: 'enum',
        isDefault: false,
        isTypeOnly: false,
      });
      continue;
    }

    // Const
    const constMatch = trimmed.match(/^pub\s+const\s+(\w+)/);
    if (constMatch) {
      exports.push({
        name: constMatch[1],
        kind: 'variable',
        isDefault: false,
        isTypeOnly: false,
      });
      continue;
    }

    // Type alias
    const typeMatch = trimmed.match(/^pub\s+type\s+(\w+)/);
    if (typeMatch) {
      exports.push({
        name: typeMatch[1],
        kind: 'type',
        isDefault: false,
        isTypeOnly: true,
      });
      continue;
    }

    // Trait
    const traitMatch = trimmed.match(/^pub\s+trait\s+(\w+)/);
    if (traitMatch) {
      exports.push({
        name: traitMatch[1],
        kind: 'interface',
        isDefault: false,
        isTypeOnly: true,
      });
    }
  }

  return exports;
}

/**
 * Resolve Rust module paths to file paths
 */
async function resolveRustModules(
  imports: RustImportInfo[],
  modDeclarations: string[],
  currentFile: string,
  rootDir: string,
): Promise<RustImportInfo[]> {
  const resolved: RustImportInfo[] = [];

  for (const imp of imports) {
    // Skip standard library imports
    if (imp.isStd) {
      resolved.push(imp);
      continue;
    }

    const resolvedPath = await resolveRustModule(
      imp.module,
      currentFile,
      rootDir,
      modDeclarations,
    );

    resolved.push({
      ...imp,
      resolved: resolvedPath || undefined,
    });
  }

  return resolved;
}

/**
 * Resolve Rust module to file path
 *
 * Rust module resolution:
 * 1. For crate::module: Look for src/module.rs or src/module/mod.rs
 * 2. For super::module: Look in parent directory
 * 3. For self::module: Look in current directory
 * 4. For mod declarations: Look for module.rs or module/mod.rs
 */
async function resolveRustModule(
  modulePath: string,
  currentFile: string,
  rootDir: string,
  modDeclarations: string[],
): Promise<string | null> {
  const currentDir = path.dirname(currentFile);

  // Handle different module path prefixes
  if (modulePath.startsWith('crate::')) {
    // Absolute from crate root
    const srcDir = path.join(rootDir, 'src');
    const relPath = modulePath.replace('crate::', '').replace(/::/g, '/');
    return await findRustFile(srcDir, relPath);
  } else if (modulePath.startsWith('super::')) {
    // Parent module
    const parentDir = path.dirname(currentDir);
    const relPath = modulePath.replace('super::', '').replace(/::/g, '/');
    return await findRustFile(parentDir, relPath);
  } else if (modulePath.startsWith('self::')) {
    // Current module
    const relPath = modulePath.replace('self::', '').replace(/::/g, '/');
    return await findRustFile(currentDir, relPath);
  } else {
    // Check if it's a declared module
    const firstPart = modulePath.split('::')[0];
    if (modDeclarations.includes(firstPart)) {
      return await findRustFile(currentDir, modulePath.replace(/::/g, '/'));
    }

    // External crate or not found
    return null;
  }
}

/**
 * Find Rust file by module path
 *
 * Checks:
 * 1. module.rs
 * 2. module/mod.rs
 */
async function findRustFile(
  baseDir: string,
  modulePath: string,
): Promise<string | null> {
  const candidates = [
    path.join(baseDir, modulePath + '.rs'),
    path.join(baseDir, modulePath, 'mod.rs'),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue to next candidate
    }
  }

  return null;
}

/**
 * Get Cargo.toml dependencies
 *
 * Extracts external crate dependencies from Cargo.toml
 * Useful for understanding project-level dependencies
 */
export async function parseCargoToml(projectDir: string): Promise<string[]> {
  const cargoPath = path.join(projectDir, 'Cargo.toml');

  try {
    const content = await fs.readFile(cargoPath, 'utf-8');
    const dependencies: string[] = [];

    // Simple parsing of [dependencies] section
    const lines = content.split('\n');
    let inDependencies = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for section headers
      if (trimmed.startsWith('[')) {
        inDependencies = trimmed === '[dependencies]';
        continue;
      }

      // Parse dependency lines
      if (inDependencies && trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^(\w+)\s*=/);
        if (match) {
          dependencies.push(match[1]);
        }
      }
    }

    return dependencies;
  } catch {
    return [];
  }
}
