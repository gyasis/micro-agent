/**
 * Python Import Parser using AST (T051)
 *
 * Parses Python files to extract import dependencies using Python's ast module.
 * Integrates with the dependency graph system for multi-language support.
 *
 * @module agents/librarian/python-import-parser
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { promises as fs } from 'fs';
import type { DependencyInfo, ImportInfo, ExportInfo } from './dependency-graph';

const execAsync = promisify(exec);

/**
 * Python-specific import information
 */
export interface PythonImportInfo extends ImportInfo {
  level?: number; // Relative import level (0 = absolute, >0 = relative)
  fromModule?: string; // Module path for 'from X import Y' imports
}

/**
 * Parse Python file dependencies using AST
 *
 * Uses Python's ast module to parse import statements:
 * - import module
 * - import module as alias
 * - from module import name
 * - from module import name as alias
 * - from . import name (relative imports)
 * - from ..module import name (parent-relative imports)
 */
export async function parsePythonDependencies(
  filePath: string,
  rootDir: string
): Promise<DependencyInfo> {
  const content = await fs.readFile(filePath, 'utf-8');

  // Use Python's ast module to parse imports
  const astScript = `
import ast
import json
import sys

def parse_imports(source_code):
    """Extract imports from Python source using AST"""
    try:
        tree = ast.parse(source_code)
    except SyntaxError as e:
        print(json.dumps({"error": f"Syntax error: {e}"}), file=sys.stderr)
        sys.exit(1)

    imports = []

    for node in ast.walk(tree):
        # Handle 'import module' and 'import module as alias'
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append({
                    "type": "import",
                    "module": alias.name,
                    "alias": alias.asname,
                    "level": 0,
                    "lineno": node.lineno
                })

        # Handle 'from module import name' and relative imports
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            level = node.level or 0

            for alias in node.names:
                imports.append({
                    "type": "from",
                    "module": module,
                    "name": alias.name,
                    "alias": alias.asname,
                    "level": level,
                    "lineno": node.lineno
                })

    return imports

# Read source from stdin
source = sys.stdin.read()
imports = parse_imports(source)
print(json.dumps(imports, indent=2))
`;

  try {
    // Execute Python AST parser
    const { stdout, stderr } = await execAsync('python3 -c ' + JSON.stringify(astScript), {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Send source code via stdin
    const pythonProcess = exec('python3', {
      maxBuffer: 10 * 1024 * 1024,
    });

    pythonProcess.stdin?.write(astScript + '\n');
    pythonProcess.stdin?.write(content);
    pythonProcess.stdin?.end();

    const output = await new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      pythonProcess.stdout?.on('data', data => {
        stdout += data;
      });

      pythonProcess.stderr?.on('data', data => {
        stderr += data;
      });

      pythonProcess.on('close', code => {
        if (code !== 0) {
          reject(new Error(`Python parser failed: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });

    const astImports = JSON.parse(output);

    // Convert AST imports to ImportInfo format
    const imports: PythonImportInfo[] = astImports.map((imp: any) => {
      if (imp.type === 'import') {
        // import module [as alias]
        return {
          module: imp.module,
          namedImports: [],
          defaultImport: imp.alias || imp.module.split('.')[0],
          isTypeOnly: false,
          level: 0,
        };
      } else {
        // from module import name [as alias]
        const importedName = imp.alias || imp.name;
        return {
          module: imp.module,
          namedImports: imp.name !== '*' ? [importedName] : [],
          namespaceImport: imp.name === '*' ? importedName : undefined,
          isTypeOnly: false,
          level: imp.level,
          fromModule: imp.module,
        };
      }
    });

    // Resolve Python module paths
    const resolvedImports = await resolvePythonImports(imports, filePath, rootDir);

    // Extract dependencies (resolved module paths)
    const dependencies = resolvedImports
      .filter(imp => imp.resolved)
      .map(imp => imp.resolved!);

    // Python doesn't have explicit exports in the same way TypeScript does
    // All top-level definitions are implicitly exported
    const exports: ExportInfo[] = extractPythonExports(content);

    const info: DependencyInfo = {
      file: path.relative(rootDir, filePath),
      imports: resolvedImports,
      exports,
      dependencies,
      dependents: [], // Filled by buildDependencyGraph
    };

    return info;
  } catch (error) {
    // Fallback: Parse imports using regex if AST parsing fails
    return parsePythonDependenciesFallback(filePath, rootDir, content);
  }
}

/**
 * Resolve Python import paths to actual file paths
 */
async function resolvePythonImports(
  imports: PythonImportInfo[],
  currentFile: string,
  rootDir: string
): Promise<PythonImportInfo[]> {
  const resolved: PythonImportInfo[] = [];

  for (const imp of imports) {
    const resolvedPath = await resolvePythonModule(
      imp.module,
      imp.level || 0,
      currentFile,
      rootDir
    );

    resolved.push({
      ...imp,
      resolved: resolvedPath || undefined,
    });
  }

  return resolved;
}

/**
 * Resolve Python module to file path
 *
 * Handles:
 * - Absolute imports: import module.submodule
 * - Relative imports: from . import module (same directory)
 * - Parent relative: from .. import module (parent directory)
 * - Package imports: from package import module (__init__.py)
 */
async function resolvePythonModule(
  modulePath: string,
  level: number,
  currentFile: string,
  rootDir: string
): Promise<string | null> {
  const currentDir = path.dirname(currentFile);

  // Calculate base directory for relative imports
  let baseDir = currentDir;
  for (let i = 1; i < level; i++) {
    baseDir = path.dirname(baseDir);
  }

  // Convert module path to file path
  const moduleParts = modulePath.split('.');
  const candidates: string[] = [];

  if (level > 0) {
    // Relative import
    const relPath = path.join(baseDir, ...moduleParts);
    candidates.push(
      relPath + '.py',
      path.join(relPath, '__init__.py'),
      relPath + '.pyi' // Type stub
    );
  } else {
    // Absolute import
    const absPath = path.join(rootDir, ...moduleParts);
    candidates.push(
      absPath + '.py',
      path.join(absPath, '__init__.py'),
      absPath + '.pyi'
    );
  }

  // Find first existing file
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return path.relative(rootDir, candidate);
    } catch {
      // Continue to next candidate
    }
  }

  return null; // External package or not found
}

/**
 * Extract Python exports (top-level definitions)
 *
 * Note: Python doesn't have explicit exports. All top-level definitions
 * are implicitly exported. Private (underscore-prefixed) names are excluded.
 */
function extractPythonExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip private definitions
    if (trimmed.startsWith('_')) continue;

    // Class definitions
    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch) {
      exports.push({
        name: classMatch[1],
        kind: 'class',
        isDefault: false,
        isTypeOnly: false,
      });
      continue;
    }

    // Function definitions
    const funcMatch = trimmed.match(/^def\s+(\w+)/);
    if (funcMatch) {
      exports.push({
        name: funcMatch[1],
        kind: 'function',
        isDefault: false,
        isTypeOnly: false,
      });
      continue;
    }

    // Variable assignments (top-level only, check indentation)
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      const varMatch = trimmed.match(/^(\w+)\s*=/);
      if (varMatch) {
        exports.push({
          name: varMatch[1],
          kind: 'variable',
          isDefault: false,
          isTypeOnly: false,
        });
      }
    }
  }

  return exports;
}

/**
 * Fallback parser using regex (when AST parsing fails)
 */
async function parsePythonDependenciesFallback(
  filePath: string,
  rootDir: string,
  content: string
): Promise<DependencyInfo> {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match: import module
    const importMatch = trimmed.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/);
    if (importMatch) {
      imports.push({
        module: importMatch[1],
        namedImports: [],
        defaultImport: importMatch[2] || importMatch[1].split('.')[0],
        isTypeOnly: false,
      });
      continue;
    }

    // Match: from module import name
    const fromMatch = trimmed.match(/^from\s+([\w.]+)\s+import\s+([\w\s,*]+)/);
    if (fromMatch) {
      const module = fromMatch[1];
      const names = fromMatch[2].split(',').map(n => n.trim());

      imports.push({
        module,
        namedImports: names.filter(n => n !== '*'),
        namespaceImport: names.includes('*') ? '*' : undefined,
        isTypeOnly: false,
      });
    }
  }

  return {
    file: path.relative(rootDir, filePath),
    imports,
    exports: extractPythonExports(content),
    dependencies: imports.map(imp => imp.module),
    dependents: [],
  };
}
