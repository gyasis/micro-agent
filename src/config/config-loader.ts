/**
 * Configuration Loader with Auto-Discovery
 *
 * Discovers ralph.config.yaml from:
 * 1. Explicit --config flag path
 * 2. ./ralph.config.yaml in current directory
 * 3. Parent directories up to git root
 * 4. Built-in defaults if no config found
 *
 * @module config/config-loader
 */

import { promises as fs } from 'fs';
import path from 'path';
import { parse as parseYAML } from 'yaml';
import { validateConfig, type RalphConfig } from './schema-validator';
import { getDefaults } from './defaults';

export interface ConfigLoaderOptions {
  configPath?: string; // Explicit config file path
  projectRoot?: string; // Project root directory
  skipValidation?: boolean; // Skip schema validation
}

export class ConfigLoader {
  private options: ConfigLoaderOptions;

  constructor(options: ConfigLoaderOptions = {}) {
    this.options = options;
  }

  /**
   * Load configuration with auto-discovery
   */
  public async load(): Promise<RalphConfig> {
    let config: any = {};

    // 1. Try explicit path if provided
    if (this.options.configPath) {
      config = await this.loadFromFile(this.options.configPath);
    } else {
      // 2. Try auto-discovery
      const discoveredPath = await this.discoverConfig();
      if (discoveredPath) {
        config = await this.loadFromFile(discoveredPath);
        console.log(`📋 Using config: ${discoveredPath}`);
      } else {
        console.log('📋 No config found - using built-in defaults');
      }
    }

    // 3. Merge with defaults
    const defaults = getDefaults();
    const merged = this.deepMerge(defaults, config);

    // 4. Validate
    if (!this.options.skipValidation) {
      return validateConfig(merged);
    }

    return merged as RalphConfig;
  }

  /**
   * Discover config file in current directory or parents
   */
  private async discoverConfig(): Promise<string | null> {
    const projectRoot = this.options.projectRoot || process.cwd();
    let currentDir = projectRoot;

    // Search up to 10 levels or git root
    for (let i = 0; i < 10; i++) {
      const configPath = path.join(currentDir, 'ralph.config.yaml');

      if (await this.fileExists(configPath)) {
        return configPath;
      }

      // Check if we're at git root
      const gitDir = path.join(currentDir, '.git');
      if (await this.directoryExists(gitDir)) {
        // We're at git root, stop searching
        break;
      }

      // Move to parent directory
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // We've reached filesystem root
        break;
      }
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * Load config from YAML file
   */
  private async loadFromFile(filepath: string): Promise<any> {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      return parseYAML(content);
    } catch (error) {
      throw new Error(`Failed to load config from ${filepath}: ${error}`);
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filepath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filepath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if directory exists
   */
  private async directoryExists(dirpath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirpath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };

    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        output[key] = this.deepMerge(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    }

    return output;
  }
}

/**
 * Factory function to load config
 */
export async function loadConfig(
  options?: ConfigLoaderOptions,
): Promise<RalphConfig> {
  const loader = new ConfigLoader(options);
  return await loader.load();
}

/**
 * Synchronous config load (for testing or simple cases)
 * Returns defaults immediately
 */
export function loadConfigSync(): RalphConfig {
  return getDefaults();
}
