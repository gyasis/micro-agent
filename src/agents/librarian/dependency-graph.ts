/**
 * Dependency Graph Parser with Performance Caching
 *
 * Uses TypeScript compiler API for accurate dependency analysis.
 * Provides deeper import/export resolution than regex-based parsing.
 *
 * Includes multi-level caching:
 * - File dependency cache (keyed by path + mtime)
 * - Module resolution cache
 * - Complete graph cache
 *
 * @module agents/librarian/dependency-graph
 */

import * as ts from 'typescript';
import path from 'path';
import { promises as fs } from 'fs';

export interface DependencyInfo {
  file: string;
  imports: ImportInfo[];
  exports: ExportInfo[];
  dependencies: string[];
  dependents: string[];
}

export interface ImportInfo {
  module: string;
  namedImports: string[];
  defaultImport?: string;
  namespaceImport?: string;
  isTypeOnly: boolean;
  resolved?: string;
}

export interface ExportInfo {
  name: string;
  kind: 'variable' | 'function' | 'class' | 'interface' | 'type' | 'enum' | 'namespace';
  isDefault: boolean;
  isTypeOnly: boolean;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyInfo>;
  edges: Array<{ from: string; to: string }>;
}

/**
 * Cache entry for file dependencies
 */
interface CacheEntry {
  info: DependencyInfo;
  mtime: number; // File modification time
}

/**
 * Performance cache for dependency graph operations
 */
export class DependencyGraphCache {
  private _fileCache = new Map<string, CacheEntry>();
  private _moduleResolutionCache = new Map<string, string | null>();
  private _graphCache = new Map<string, DependencyGraph>();
  private _maxCacheSize = 1000; // Prevent unbounded growth

  /**
   * Get cached file dependencies if not stale
   */
  async getFileDependencies(
    filePath: string,
    rootDir: string
  ): Promise<DependencyInfo | null> {
    const cacheKey = path.relative(rootDir, filePath);
    const cached = this._fileCache.get(cacheKey);

    if (!cached) return null;

    // Check if file modified since cache
    try {
      const stats = await fs.stat(filePath);
      if (stats.mtimeMs !== cached.mtime) {
        this._fileCache.delete(cacheKey);
        return null;
      }
      return cached.info;
    } catch {
      this._fileCache.delete(cacheKey);
      return null;
    }
  }

  /**
   * Store file dependencies in cache
   */
  async setFileDependencies(
    filePath: string,
    rootDir: string,
    info: DependencyInfo
  ): Promise<void> {
    const cacheKey = path.relative(rootDir, filePath);

    try {
      const stats = await fs.stat(filePath);
      this._fileCache.set(cacheKey, { info, mtime: stats.mtimeMs });

      // Evict oldest entries if cache too large
      if (this._fileCache.size > this._maxCacheSize) {
        const firstKey = this._fileCache.keys().next().value;
        this._fileCache.delete(firstKey);
      }
    } catch {
      // Ignore stat errors
    }
  }

  /**
   * Get cached module resolution
   */
  getModuleResolution(
    modulePath: string,
    fromDir: string,
    rootDir: string
  ): string | null | undefined {
    const cacheKey = `${fromDir}:${modulePath}`;
    return this._moduleResolutionCache.get(cacheKey);
  }

  /**
   * Store module resolution in cache
   */
  setModuleResolution(
    modulePath: string,
    fromDir: string,
    rootDir: string,
    resolved: string | null
  ): void {
    const cacheKey = `${fromDir}:${modulePath}`;
    this._moduleResolutionCache.set(cacheKey, resolved);

    // Evict oldest entries if cache too large
    if (this._moduleResolutionCache.size > this._maxCacheSize) {
      const firstKey = this._moduleResolutionCache.keys().next().value;
      this._moduleResolutionCache.delete(firstKey);
    }
  }

  /**
   * Get cached dependency graph
   */
  async getGraph(
    files: string[],
    rootDir: string
  ): Promise<DependencyGraph | null> {
    const cacheKey = files.sort().join(':');
    const cached = this._graphCache.get(cacheKey);

    if (!cached) return null;

    // Verify all files still have same mtime
    for (const file of files) {
      const relPath = path.relative(rootDir, file);
      const fileInfo = this._fileCache.get(relPath);
      if (!fileInfo) return null;

      try {
        const stats = await fs.stat(file);
        if (stats.mtimeMs !== fileInfo.mtime) {
          this._graphCache.delete(cacheKey);
          return null;
        }
      } catch {
        this._graphCache.delete(cacheKey);
        return null;
      }
    }

    return cached;
  }

  /**
   * Store dependency graph in cache
   */
  setGraph(files: string[], rootDir: string, graph: DependencyGraph): void {
    const cacheKey = files.sort().join(':');
    this._graphCache.set(cacheKey, graph);

    // Evict oldest entries if cache too large
    if (this._graphCache.size > 100) {
      // Keep graph cache smaller
      const firstKey = this._graphCache.keys().next().value;
      this._graphCache.delete(firstKey);
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this._fileCache.clear();
    this._moduleResolutionCache.clear();
    this._graphCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      fileCacheSize: this._fileCache.size,
      moduleResolutionCacheSize: this._moduleResolutionCache.size,
      graphCacheSize: this._graphCache.size,
      maxCacheSize: this._maxCacheSize,
    };
  }
}

/**
 * Global cache instance (singleton pattern for cross-iteration caching)
 */
const globalCache = new DependencyGraphCache();

/**
 * Parse dependencies for a single file using TypeScript compiler
 * with caching for performance
 */
export async function parseFileDependencies(
  filePath: string,
  rootDir: string,
  cache: DependencyGraphCache = globalCache
): Promise<DependencyInfo> {
  // Check cache first
  const cached = await cache.getFileDependencies(filePath, rootDir);
  if (cached) {
    return cached;
  }

  // Parse file
  const content = await fs.readFile(filePath, 'utf-8');

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const imports = extractImports(sourceFile);
  const exports = extractExports(sourceFile);

  // Resolve import paths (with caching)
  const resolvedImports = await resolveImports(imports, filePath, rootDir, cache);

  const dependencies = resolvedImports
    .filter(imp => imp.resolved)
    .map(imp => imp.resolved!);

  const info: DependencyInfo = {
    file: path.relative(rootDir, filePath),
    imports: resolvedImports,
    exports,
    dependencies,
    dependents: [], // Filled by buildDependencyGraph
  };

  // Store in cache
  await cache.setFileDependencies(filePath, rootDir, info);

  return info;
}

/**
 * Extract import information from AST
 */
function extractImports(sourceFile: ts.SourceFile): ImportInfo[] {
  const imports: ImportInfo[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const importInfo = parseImportDeclaration(node);
      if (importInfo) {
        imports.push(importInfo);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

/**
 * Parse import declaration node
 */
function parseImportDeclaration(node: ts.ImportDeclaration): ImportInfo | null {
  const moduleSpecifier = node.moduleSpecifier;
  if (!ts.isStringLiteral(moduleSpecifier)) {
    return null;
  }

  const module = moduleSpecifier.text;
  const namedImports: string[] = [];
  let defaultImport: string | undefined;
  let namespaceImport: string | undefined;

  if (node.importClause) {
    const clause = node.importClause;

    // Default import
    if (clause.name) {
      defaultImport = clause.name.text;
    }

    // Named imports
    if (clause.namedBindings) {
      if (ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          namedImports.push(element.name.text);
        }
      }
      // Namespace import
      else if (ts.isNamespaceImport(clause.namedBindings)) {
        namespaceImport = clause.namedBindings.name.text;
      }
    }
  }

  return {
    module,
    namedImports,
    defaultImport,
    namespaceImport,
    isTypeOnly: node.importClause?.isTypeOnly ?? false,
  };
}

/**
 * Extract export information from AST
 */
function extractExports(sourceFile: ts.SourceFile): ExportInfo[] {
  const exports: ExportInfo[] = [];

  function visit(node: ts.Node) {
    // Export declaration (export { ... })
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          exports.push({
            name: element.name.text,
            kind: 'variable', // Default to variable, we don't know the exact kind
            isDefault: false,
            isTypeOnly: element.isTypeOnly,
          });
        }
      }
    }

    // Export assignment (export = ...)
    else if (ts.isExportAssignment(node)) {
      exports.push({
        name: 'default',
        kind: 'variable',
        isDefault: true,
        isTypeOnly: false,
      });
    }

    // Exported declarations
    else if (hasExportModifier(node)) {
      const exportInfo = parseExportedDeclaration(node);
      if (exportInfo) {
        exports.push(exportInfo);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return exports;
}

/**
 * Check if node has export modifier
 */
function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;

  const modifiers = ts.getModifiers(node);
  if (!modifiers) return false;

  return modifiers.some(
    m => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword
  );
}

/**
 * Parse exported declaration
 */
function parseExportedDeclaration(node: ts.Node): ExportInfo | null {
  let name: string | undefined;
  let kind: ExportInfo['kind'] = 'variable';
  let isDefault = false;
  let isTypeOnly = false;

  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0];
    if (ts.isIdentifier(declaration.name)) {
      name = declaration.name.text;
      kind = 'variable';
    }
  } else if (ts.isFunctionDeclaration(node)) {
    name = node.name?.text;
    kind = 'function';
  } else if (ts.isClassDeclaration(node)) {
    name = node.name?.text;
    kind = 'class';
  } else if (ts.isInterfaceDeclaration(node)) {
    name = node.name.text;
    kind = 'interface';
    isTypeOnly = true;
  } else if (ts.isTypeAliasDeclaration(node)) {
    name = node.name.text;
    kind = 'type';
    isTypeOnly = true;
  } else if (ts.isEnumDeclaration(node)) {
    name = node.name.text;
    kind = 'enum';
  } else if (ts.isModuleDeclaration(node)) {
    name = node.name.text;
    kind = 'namespace';
  }

  if (!name) return null;

  // Check for default modifier
  if (ts.canHaveModifiers(node)) {
    const modifiers = ts.getModifiers(node);
    if (modifiers) {
      isDefault = modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
    }
  }

  return { name: name || 'default', kind, isDefault, isTypeOnly };
}

/**
 * Resolve import paths to actual files with caching
 */
async function resolveImports(
  imports: ImportInfo[],
  fromFile: string,
  rootDir: string,
  cache: DependencyGraphCache = globalCache
): Promise<ImportInfo[]> {
  const resolved = [...imports];

  for (const imp of resolved) {
    // Skip external packages
    if (!imp.module.startsWith('.') && !imp.module.startsWith('/')) {
      continue;
    }

    const fromDir = path.dirname(fromFile);
    const resolvedPath = await resolveModulePath(imp.module, fromDir, rootDir, cache);

    if (resolvedPath) {
      imp.resolved = path.relative(rootDir, resolvedPath);
    }
  }

  return resolved;
}

/**
 * Resolve module path to file with caching
 */
async function resolveModulePath(
  modulePath: string,
  fromDir: string,
  rootDir: string,
  cache: DependencyGraphCache = globalCache
): Promise<string | null> {
  // Check cache first
  const cached = cache.getModuleResolution(modulePath, fromDir, rootDir);
  if (cached !== undefined) {
    return cached;
  }

  // Resolve path
  const basePath = path.resolve(fromDir, modulePath);

  // Try exact path
  if (await fileExists(basePath)) {
    cache.setModuleResolution(modulePath, fromDir, rootDir, basePath);
    return basePath;
  }

  // Try with extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.d.ts'];
  for (const ext of extensions) {
    const withExt = basePath + ext;
    if (await fileExists(withExt)) {
      cache.setModuleResolution(modulePath, fromDir, rootDir, withExt);
      return withExt;
    }
  }

  // Try index files
  const indexPaths = extensions.map(ext => path.join(basePath, `index${ext}`));
  for (const indexPath of indexPaths) {
    if (await fileExists(indexPath)) {
      cache.setModuleResolution(modulePath, fromDir, rootDir, indexPath);
      return indexPath;
    }
  }

  // Cache null result (failed resolution)
  cache.setModuleResolution(modulePath, fromDir, rootDir, null);
  return null;
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build complete dependency graph from multiple files with caching
 */
export async function buildDependencyGraph(
  files: string[],
  rootDir: string,
  cache: DependencyGraphCache = globalCache
): Promise<DependencyGraph> {
  // Check cache first
  const cachedGraph = await cache.getGraph(files, rootDir);
  if (cachedGraph) {
    return cachedGraph;
  }

  // Build graph
  const nodes = new Map<string, DependencyInfo>();
  const edges: Array<{ from: string; to: string }> = [];

  // Parse all files (with individual file caching)
  for (const file of files) {
    const info = await parseFileDependencies(file, rootDir, cache);
    nodes.set(info.file, info);
  }

  // Build edges and fill dependents
  for (const [file, info] of nodes) {
    for (const dep of info.dependencies) {
      edges.push({ from: file, to: dep });

      const depNode = nodes.get(dep);
      if (depNode) {
        depNode.dependents.push(file);
      }
    }
  }

  const graph = { nodes, edges };

  // Store in cache
  cache.setGraph(files, rootDir, graph);

  return graph;
}

/**
 * Calculate distance from target file in graph
 */
export function calculateDistances(
  graph: DependencyGraph,
  targetFile: string
): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: Array<{ file: string; distance: number }> = [
    { file: targetFile, distance: 0 },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { file, distance } = queue.shift()!;
    if (visited.has(file)) continue;

    visited.add(file);
    distances.set(file, distance);

    const node = graph.nodes.get(file);
    if (!node) continue;

    // Add dependencies and dependents
    for (const neighbor of [...node.dependencies, ...node.dependents]) {
      if (!visited.has(neighbor)) {
        queue.push({ file: neighbor, distance: distance + 1 });
      }
    }
  }

  return distances;
}

/**
 * Find circular dependencies in graph
 */
export function findCircularDependencies(
  graph: DependencyGraph
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(file: string, path: string[]): void {
    visited.add(file);
    recursionStack.add(file);
    path.push(file);

    const node = graph.nodes.get(file);
    if (node) {
      for (const dep of node.dependencies) {
        if (!visited.has(dep)) {
          dfs(dep, [...path]);
        } else if (recursionStack.has(dep)) {
          // Found cycle
          const cycleStart = path.indexOf(dep);
          const cycle = path.slice(cycleStart);
          cycles.push([...cycle, dep]);
        }
      }
    }

    recursionStack.delete(file);
  }

  for (const file of graph.nodes.keys()) {
    if (!visited.has(file)) {
      dfs(file, []);
    }
  }

  return cycles;
}
