/**
 * Plugin Loader
 *
 * Loads and validates plugins from ralph-plugins.yaml configuration.
 * Supports both local file paths and npm packages.
 *
 * @module plugins/plugin-loader
 */

import { promises as fs } from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import type {
  RalphPlugin,
  PluginConfig,
  PluginRegistryEntry,
  PluginError,
} from './sdk/plugin.interface';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Plugin loader configuration from YAML
 */
export interface PluginLoaderConfig {
  plugins: PluginDefinition[];
}

/**
 * Plugin definition from YAML
 */
export interface PluginDefinition {
  /**
   * Plugin name (for npm) or file path (for local)
   */
  plugin: string;

  /**
   * Enable/disable plugin
   */
  enabled?: boolean;

  /**
   * Plugin-specific configuration
   */
  config?: PluginConfig;
}

/**
 * Plugin loader
 */
export class PluginLoader {
  private registry: Map<string, PluginRegistryEntry> = new Map();
  private configPath: string;

  constructor(configPath: string = 'ralph-plugins.yaml') {
    this.configPath = configPath;
  }

  /**
   * Load all plugins from configuration
   */
  async loadPlugins(): Promise<PluginRegistryEntry[]> {
    try {
      // Check if config file exists
      const configExists = await this.fileExists(this.configPath);
      if (!configExists) {
        logger.info('No ralph-plugins.yaml found - running without plugins');
        return [];
      }

      // Load and parse YAML
      const config = await this.loadConfig();
      logger.info(
        `Loading ${config.plugins.length} plugin(s) from ${this.configPath}`,
      );

      // Load each plugin
      const entries: PluginRegistryEntry[] = [];
      for (const definition of config.plugins) {
        try {
          const entry = await this.loadPlugin(definition);
          if (entry) {
            entries.push(entry);
            this.registry.set(entry.plugin.name, entry);
          }
        } catch (error) {
          logger.error(`Failed to load plugin: ${definition.plugin}`, error);
          // Continue loading other plugins
        }
      }

      logger.info(`Successfully loaded ${entries.length} plugin(s)`);
      return entries;
    } catch (error) {
      logger.error('Failed to load plugins', error);
      throw new Error(`Plugin loading failed: ${error}`);
    }
  }

  /**
   * Load single plugin
   */
  private async loadPlugin(
    definition: PluginDefinition,
  ): Promise<PluginRegistryEntry | null> {
    const startTime = Date.now();

    // Check if disabled
    if (definition.enabled === false) {
      logger.debug(`Plugin disabled: ${definition.plugin}`);
      return null;
    }

    try {
      // Determine if local file or npm package
      const isLocalFile = this.isLocalPath(definition.plugin);

      let plugin: RalphPlugin;
      if (isLocalFile) {
        plugin = await this.loadLocalPlugin(definition.plugin);
      } else {
        plugin = await this.loadNpmPlugin(definition.plugin);
      }

      // Validate plugin
      this.validatePlugin(plugin);

      // Initialize plugin
      if (plugin.initialize) {
        await plugin.initialize(definition.config || {});
      }

      const loadTime = Date.now() - startTime;

      logger.info(
        `Loaded plugin: ${plugin.name} v${plugin.version} (${loadTime}ms)`,
      );

      return {
        plugin,
        config: definition.config || {},
        enabled: true,
        loadTime,
      };
    } catch (error) {
      throw new Error(`Failed to load plugin "${definition.plugin}": ${error}`);
    }
  }

  /**
   * Load plugin from local file path
   */
  private async loadLocalPlugin(filePath: string): Promise<RalphPlugin> {
    const absolutePath = path.resolve(process.cwd(), filePath);

    // Check if file exists
    const exists = await this.fileExists(absolutePath);
    if (!exists) {
      throw new Error(`Plugin file not found: ${absolutePath}`);
    }

    // Dynamic import
    const module = await import(absolutePath);

    // Support default export or named export
    const plugin = module.default || module.plugin;

    if (!plugin) {
      throw new Error(
        `Plugin file must export default or named "plugin": ${filePath}`,
      );
    }

    return plugin;
  }

  /**
   * Load plugin from npm package
   */
  private async loadNpmPlugin(packageName: string): Promise<RalphPlugin> {
    try {
      // Dynamic import from node_modules
      const module = await import(packageName);

      // Support default export or named export
      const plugin = module.default || module.plugin;

      if (!plugin) {
        throw new Error(
          `Package must export default or named "plugin": ${packageName}`,
        );
      }

      return plugin;
    } catch (error) {
      if ((error as any).code === 'MODULE_NOT_FOUND') {
        throw new Error(
          `Plugin package not found: ${packageName}. Run: npm install ${packageName}`,
        );
      }
      throw error;
    }
  }

  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: RalphPlugin): void {
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new Error('Plugin must have a "name" string property');
    }

    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new Error('Plugin must have a "version" string property');
    }

    // Check for at least one hook
    const hooks = [
      'onBeforeGen',
      'onAfterGen',
      'onTestFail',
      'onBeforeSuccess',
      'onSuccess',
      'onFailure',
      'onContextReset',
      'onBudgetExceeded',
      'onEntropyDetected',
    ];

    const hasHook = hooks.some(
      (hook) => typeof (plugin as any)[hook] === 'function',
    );

    if (!hasHook && !plugin.initialize && !plugin.cleanup) {
      throw new Error(
        'Plugin must implement at least one hook or lifecycle method',
      );
    }
  }

  /**
   * Load configuration from YAML file
   */
  private async loadConfig(): Promise<PluginLoaderConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = parseYaml(content);

      if (!parsed.plugins || !Array.isArray(parsed.plugins)) {
        throw new Error('Config must have a "plugins" array');
      }

      return parsed as PluginLoaderConfig;
    } catch (error) {
      throw new Error(`Failed to parse ${this.configPath}: ${error}`);
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if path is local file path
   */
  private isLocalPath(plugin: string): boolean {
    return (
      plugin.startsWith('./') ||
      plugin.startsWith('../') ||
      plugin.startsWith('/') ||
      plugin.endsWith('.js') ||
      plugin.endsWith('.ts')
    );
  }

  /**
   * Get loaded plugin by name
   */
  getPlugin(name: string): PluginRegistryEntry | undefined {
    return this.registry.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): PluginRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get enabled plugins only
   */
  getEnabledPlugins(): PluginRegistryEntry[] {
    return this.getAllPlugins().filter((entry) => entry.enabled);
  }

  /**
   * Cleanup all plugins
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up plugins...');

    for (const entry of this.registry.values()) {
      try {
        if (entry.plugin.cleanup) {
          await entry.plugin.cleanup();
        }
      } catch (error) {
        logger.error(`Failed to cleanup plugin: ${entry.plugin.name}`, error);
      }
    }

    this.registry.clear();
    logger.info('All plugins cleaned up');
  }

  /**
   * Reload plugins from configuration
   */
  async reload(): Promise<void> {
    await this.cleanup();
    await this.loadPlugins();
  }
}

/**
 * Create plugin loader instance
 */
export function createPluginLoader(configPath?: string): PluginLoader {
  return new PluginLoader(configPath);
}
