/**
 * Framework Detector
 *
 * Auto-detects test frameworks from project manifest files:
 * - package.json (Jest, Vitest, Mocha, etc.)
 * - requirements.txt / pyproject.toml (pytest)
 * - Cargo.toml (cargo test)
 * - Gemfile (RSpec)
 * - pom.xml (JUnit)
 *
 * @module parsers/framework-detector
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileExists } from '../utils/file-io';

export type TestFramework =
  | 'vitest'
  | 'jest'
  | 'mocha'
  | 'pytest'
  | 'cargo'
  | 'rspec'
  | 'junit'
  | 'custom';

export interface DetectionResult {
  framework: TestFramework;
  confidence: 'high' | 'medium' | 'low';
  command?: string;
  configFile?: string;
  details: string;
}

/**
 * Detect test framework from project directory
 */
export async function detectFramework(
  projectDir: string
): Promise<DetectionResult> {
  // Try detection methods in order of confidence
  const detectors = [
    detectFromPackageJson,
    detectFromPythonManifest,
    detectFromCargoToml,
    detectFromGemfile,
    detectFromPom,
    detectFromConfigFiles,
  ];

  for (const detector of detectors) {
    const result = await detector(projectDir);
    if (result) return result;
  }

  // Default to custom if nothing detected
  return {
    framework: 'custom',
    confidence: 'low',
    details: 'No recognized test framework detected',
  };
}

/**
 * Detect from package.json (Node.js projects)
 */
async function detectFromPackageJson(
  projectDir: string
): Promise<DetectionResult | null> {
  const packageJsonPath = path.join(projectDir, 'package.json');

  if (!(await fileExists(packageJsonPath))) {
    return null;
  }

  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    const { dependencies = {}, devDependencies = {} } = pkg;
    const allDeps = { ...dependencies, ...devDependencies };

    // Check for Vitest
    if (allDeps.vitest) {
      return {
        framework: 'vitest',
        confidence: 'high',
        command: pkg.scripts?.test || 'vitest',
        configFile: await findConfigFile(projectDir, [
          'vitest.config.ts',
          'vitest.config.js',
          'vite.config.ts',
        ]),
        details: 'Vitest detected in dependencies',
      };
    }

    // Check for Jest
    if (allDeps.jest || allDeps['@jest/core']) {
      return {
        framework: 'jest',
        confidence: 'high',
        command: pkg.scripts?.test || 'jest',
        configFile: await findConfigFile(projectDir, [
          'jest.config.js',
          'jest.config.ts',
          'jest.config.json',
        ]),
        details: 'Jest detected in dependencies',
      };
    }

    // Check for Mocha
    if (allDeps.mocha) {
      return {
        framework: 'mocha',
        confidence: 'high',
        command: pkg.scripts?.test || 'mocha',
        details: 'Mocha detected in dependencies',
      };
    }

    // Check test script
    if (pkg.scripts?.test) {
      const testScript = pkg.scripts.test.toLowerCase();

      if (testScript.includes('vitest')) {
        return {
          framework: 'vitest',
          confidence: 'medium',
          command: pkg.scripts.test,
          details: 'Vitest detected in test script',
        };
      }

      if (testScript.includes('jest')) {
        return {
          framework: 'jest',
          confidence: 'medium',
          command: pkg.scripts.test,
          details: 'Jest detected in test script',
        };
      }

      if (testScript.includes('mocha')) {
        return {
          framework: 'mocha',
          confidence: 'medium',
          command: pkg.scripts.test,
          details: 'Mocha detected in test script',
        };
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Detect from Python manifests
 */
async function detectFromPythonManifest(
  projectDir: string
): Promise<DetectionResult | null> {
  // Check pyproject.toml
  const pyprojectPath = path.join(projectDir, 'pyproject.toml');
  if (await fileExists(pyprojectPath)) {
    const content = await fs.readFile(pyprojectPath, 'utf-8');

    if (content.includes('pytest')) {
      return {
        framework: 'pytest',
        confidence: 'high',
        command: 'pytest',
        configFile: pyprojectPath,
        details: 'pytest detected in pyproject.toml',
      };
    }
  }

  // Check requirements.txt
  const reqPath = path.join(projectDir, 'requirements.txt');
  if (await fileExists(reqPath)) {
    const content = await fs.readFile(reqPath, 'utf-8');

    if (content.includes('pytest')) {
      return {
        framework: 'pytest',
        confidence: 'high',
        command: 'pytest',
        details: 'pytest detected in requirements.txt',
      };
    }
  }

  // Check for pytest config files
  const pytestConfig = await findConfigFile(projectDir, [
    'pytest.ini',
    'tox.ini',
    'setup.cfg',
  ]);

  if (pytestConfig) {
    return {
      framework: 'pytest',
      confidence: 'high',
      command: 'pytest',
      configFile: pytestConfig,
      details: 'pytest config file detected',
    };
  }

  return null;
}

/**
 * Detect from Cargo.toml (Rust projects)
 */
async function detectFromCargoToml(
  projectDir: string
): Promise<DetectionResult | null> {
  const cargoPath = path.join(projectDir, 'Cargo.toml');

  if (!(await fileExists(cargoPath))) {
    return null;
  }

  return {
    framework: 'cargo',
    confidence: 'high',
    command: 'cargo test',
    configFile: cargoPath,
    details: 'Rust project detected (cargo test)',
  };
}

/**
 * Detect from Gemfile (Ruby projects)
 */
async function detectFromGemfile(
  projectDir: string
): Promise<DetectionResult | null> {
  const gemfilePath = path.join(projectDir, 'Gemfile');

  if (!(await fileExists(gemfilePath))) {
    return null;
  }

  const content = await fs.readFile(gemfilePath, 'utf-8');

  if (content.includes('rspec')) {
    return {
      framework: 'rspec',
      confidence: 'high',
      command: 'bundle exec rspec',
      details: 'RSpec detected in Gemfile',
    };
  }

  return null;
}

/**
 * Detect from pom.xml (Java projects)
 */
async function detectFromPom(
  projectDir: string
): Promise<DetectionResult | null> {
  const pomPath = path.join(projectDir, 'pom.xml');

  if (!(await fileExists(pomPath))) {
    return null;
  }

  const content = await fs.readFile(pomPath, 'utf-8');

  if (content.includes('junit')) {
    return {
      framework: 'junit',
      confidence: 'high',
      command: 'mvn test',
      configFile: pomPath,
      details: 'JUnit detected in pom.xml',
    };
  }

  return null;
}

/**
 * Detect from config files
 */
async function detectFromConfigFiles(
  projectDir: string
): Promise<DetectionResult | null> {
  // Vitest
  if (await findConfigFile(projectDir, ['vitest.config.ts', 'vitest.config.js'])) {
    return {
      framework: 'vitest',
      confidence: 'medium',
      command: 'vitest',
      details: 'Vitest config file found',
    };
  }

  // Jest
  if (await findConfigFile(projectDir, ['jest.config.js', 'jest.config.ts'])) {
    return {
      framework: 'jest',
      confidence: 'medium',
      command: 'jest',
      details: 'Jest config file found',
    };
  }

  // pytest
  if (await findConfigFile(projectDir, ['pytest.ini', 'tox.ini'])) {
    return {
      framework: 'pytest',
      confidence: 'medium',
      command: 'pytest',
      details: 'pytest config file found',
    };
  }

  return null;
}

/**
 * Find first existing config file from list
 */
async function findConfigFile(
  projectDir: string,
  candidates: string[]
): Promise<string | undefined> {
  for (const candidate of candidates) {
    const fullPath = path.join(projectDir, candidate);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
}

/**
 * Get default test command for framework
 */
export function getDefaultTestCommand(framework: TestFramework): string {
  const commands: Record<TestFramework, string> = {
    vitest: 'vitest run',
    jest: 'jest',
    mocha: 'mocha',
    pytest: 'pytest',
    cargo: 'cargo test',
    rspec: 'bundle exec rspec',
    junit: 'mvn test',
    custom: 'npm test',
  };

  return commands[framework];
}

/**
 * Get test file patterns for framework
 */
export function getTestFilePatterns(framework: TestFramework): string[] {
  const patterns: Record<TestFramework, string[]> = {
    vitest: ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/*.spec.js'],
    jest: ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/*.spec.js'],
    mocha: ['**/*.test.js', '**/test/**/*.js'],
    pytest: ['test_*.py', '*_test.py', '**/test/**/*.py'],
    cargo: ['**/tests/**/*.rs', '**/*_test.rs'],
    rspec: ['**/*_spec.rb', '**/spec/**/*.rb'],
    junit: ['**/*Test.java', '**/src/test/**/*.java'],
    custom: ['**/*.test.*', '**/*.spec.*'],
  };

  return patterns[framework];
}
