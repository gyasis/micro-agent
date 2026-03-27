/**
 * Vector Backend Factory
 *
 * Creates the appropriate backend based on configuration.
 * Supports auto-fallback: LanceDB → Vectra when native binary fails.
 *
 * @module memory/backends
 */

export { LanceDbBackend } from './lancedb-backend';
export { VectraBackend } from './vectra-backend';
export type { VectorBackend, QueryResult } from '../vector-backend';

import type { VectorBackend } from '../vector-backend';
import { LanceDbBackend } from './lancedb-backend';
import { VectraBackend } from './vectra-backend';
import { createLogger } from '../../utils/logger';

const logger = createLogger();

export interface BackendConfig {
  vectorDb: 'lancedb' | 'vectra';
  dataDir: string;
}

/**
 * Create the requested backend.
 * Does NOT initialize — caller must call `.initialize()`.
 */
export function createVectorBackend(config: BackendConfig): VectorBackend {
  if (config.vectorDb === 'vectra') {
    return new VectraBackend(config.dataDir);
  }
  return new LanceDbBackend(config.dataDir);
}

/**
 * Create a backend with automatic fallback.
 * Tries the requested backend first, falls back to the other on failure.
 * Returns an initialized, connected backend — or throws if both fail.
 */
export async function createVectorBackendWithFallback(
  config: BackendConfig,
): Promise<VectorBackend> {
  const primary = createVectorBackend(config);

  try {
    await primary.initialize();
    return primary;
  } catch (primaryError) {
    const fallbackType = config.vectorDb === 'lancedb' ? 'vectra' : 'lancedb';
    logger.warn(
      `[VectorBackend] ${config.vectorDb} failed, falling back to ${fallbackType}`,
      { error: primaryError },
    );

    const fallback = createVectorBackend({
      ...config,
      vectorDb: fallbackType as 'lancedb' | 'vectra',
    });

    try {
      await fallback.initialize();
      return fallback;
    } catch (fallbackError) {
      logger.error('[VectorBackend] Both backends failed', {
        primaryError,
        fallbackError,
      });
      throw fallbackError;
    }
  }
}
