/**
 * Dependency Graph Parser
 *
 * Uses TypeScript compiler API for accurate dependency analysis.
 * Provides deeper import/export resolution than regex-based parsing.
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
 * Parse dependencies for a single file using TypeScript compiler
 */
export async function parseFileDependencies(
  filePath: string,
  rootDir: string
): Promise<DependencyInfo> {
  const content = await fs.readFile(filePath, 'utf-8');

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const imports = extractImports(sourceFile);
  const exports = extractExports(sourceFile);

  // Resolve import paths
  const resolvedImports = await resolveImports(imports, filePath, rootDir);

  const dependencies = resolvedImports
    .filter(imp => imp.resolved)
    .map(imp => imp.resolved!);

  return {
    file: path.relative(rootDir, filePath),
    imports: resolvedImports,
    exports,
    dependencies,
    dependents: [], // Filled by buildDependencyGraph
  };
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
 * Resolve import paths to actual files
 */
async function resolveImports(
  imports: ImportInfo[],
  fromFile: string,
  rootDir: string
): Promise<ImportInfo[]> {
  const resolved = [...imports];

  for (const imp of resolved) {
    // Skip external packages
    if (!imp.module.startsWith('.') && !imp.module.startsWith('/')) {
      continue;
    }

    const fromDir = path.dirname(fromFile);
    const resolvedPath = await resolveModulePath(imp.module, fromDir, rootDir);

    if (resolvedPath) {
      imp.resolved = path.relative(rootDir, resolvedPath);
    }
  }

  return resolved;
}

/**
 * Resolve module path to file
 */
async function resolveModulePath(
  modulePath: string,
  fromDir: string,
  rootDir: string
): Promise<string | null> {
  const basePath = path.resolve(fromDir, modulePath);

  // Try exact path
  if (await fileExists(basePath)) {
    return basePath;
  }

  // Try with extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.d.ts'];
  for (const ext of extensions) {
    const withExt = basePath + ext;
    if (await fileExists(withExt)) {
      return withExt;
    }
  }

  // Try index files
  const indexPaths = extensions.map(ext => path.join(basePath, `index${ext}`));
  for (const indexPath of indexPaths) {
    if (await fileExists(indexPath)) {
      return indexPath;
    }
  }

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
 * Build complete dependency graph from multiple files
 */
export async function buildDependencyGraph(
  files: string[],
  rootDir: string
): Promise<DependencyGraph> {
  const nodes = new Map<string, DependencyInfo>();
  const edges: Array<{ from: string; to: string }> = [];

  // Parse all files
  for (const file of files) {
    const info = await parseFileDependencies(file, rootDir);
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

  return { nodes, edges };
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
