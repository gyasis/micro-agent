/**
 * Vectra Vector Backend
 *
 * Pure-JS fallback vector storage using Vectra's LocalIndex.
 * Stores everything as JSON files under `<dataDir>/vectordb-vectra/`.
 * No native dependencies — works everywhere Node runs.
 *
 * Returns cosine distance (1 - similarity) so the scale matches
 * the LanceDB backend's cosine distance metric.
 *
 * @module memory/backends/vectra-backend
 */

import { LocalIndex } from 'vectra';
import * as path from 'path';
import * as fs from 'fs';
import type { VectorBackend, QueryResult } from '../vector-backend';
import { textToVector } from './text-hash';
import { createLogger } from '../../utils/logger';

const logger = createLogger();

export class VectraBackend implements VectorBackend {
  private basePath: string;
  private indexes: Map<string, LocalIndex> = new Map();
  private connected = false;

  constructor(dataDir: string) {
    this.basePath = path.join(dataDir, 'vectordb-vectra');
  }

  async initialize(): Promise<void> {
    try {
      if (!fs.existsSync(this.basePath)) {
        fs.mkdirSync(this.basePath, { recursive: true });
      }
      this.connected = true;
      logger.info('Vectra backend initialized', { path: this.basePath });
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async getOrCreateIndex(collection: string): Promise<LocalIndex> {
    if (this.indexes.has(collection)) {
      return this.indexes.get(collection)!;
    }

    const indexPath = path.join(this.basePath, collection);
    const index = new LocalIndex(indexPath);

    if (!(await index.isIndexCreated())) {
      await index.createIndex();
    }

    this.indexes.set(collection, index);
    return index;
  }

  async addDocuments(
    collection: string,
    ids: string[],
    documents: string[],
    metadatas: Record<string, any>[],
  ): Promise<void> {
    const index = await this.getOrCreateIndex(collection);

    for (let i = 0; i < ids.length; i++) {
      await index.insertItem({
        id: ids[i],
        vector: textToVector(documents[i]),
        metadata: {
          // Store the original metadata without injecting extra fields.
          // The `id` is tracked by Vectra's item.id, and `text` goes
          // into a dedicated field so it doesn't leak into metadata.
          __text: documents[i],
          ...metadatas[i],
        },
      });
    }
  }

  async query(
    collection: string,
    queryText: string,
    nResults: number,
    where?: Record<string, any>,
  ): Promise<QueryResult> {
    const index = await this.getOrCreateIndex(collection);

    const queryVec = textToVector(queryText || 'query');
    const results = await index.queryItems(queryVec, nResults * 2);

    const ids: string[] = [];
    const distances: number[] = [];
    const metas: Record<string, any>[] = [];

    for (const result of results) {
      const rawMeta = result.item.metadata as Record<string, any>;

      // Strip internal fields before returning to caller
      const { __text, ...meta } = rawMeta;

      // Apply where filter manually
      if (where) {
        let matches = true;
        for (const [key, val] of Object.entries(where)) {
          if (meta[key] !== val) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      const itemId = result.item.id ?? (meta.id as string) ?? '';
      ids.push(String(itemId));
      // Vectra returns cosine similarity (0–1). Convert to cosine distance (1 – sim).
      distances.push(1 - result.score);
      metas.push(meta);

      if (ids.length >= nResults) break;
    }

    return { ids, distances, metadatas: metas };
  }

  async get(
    collection: string,
    ids: string[],
  ): Promise<{ metadatas: (Record<string, any> | null)[] }> {
    const index = await this.getOrCreateIndex(collection);
    const metadatas: (Record<string, any> | null)[] = [];

    for (const id of ids) {
      const item = await index.getItem(id);
      if (item) {
        const { __text, ...meta } = item.metadata as Record<string, any>;
        metadatas.push(meta);
      } else {
        metadatas.push(null);
      }
    }

    return { metadatas };
  }

  async update(
    collection: string,
    id: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    const index = await this.getOrCreateIndex(collection);
    const existing = await index.getItem(id);
    if (!existing) return;

    const oldMeta = existing.metadata as Record<string, any>;

    // Delete + re-insert (Vectra has no native update)
    await index.deleteItem(id);
    await index.insertItem({
      id,
      vector: existing.vector,
      metadata: {
        __text: oldMeta.__text,
        ...metadata,
      },
    });
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    const index = await this.getOrCreateIndex(collection);
    for (const id of ids) {
      await index.deleteItem(id);
    }
  }

  async count(collection: string): Promise<number> {
    try {
      const index = await this.getOrCreateIndex(collection);
      const items = await index.listItems();
      return items.length;
    } catch {
      return 0;
    }
  }

  async clear(): Promise<void> {
    try {
      if (fs.existsSync(this.basePath)) {
        fs.rmSync(this.basePath, { recursive: true, force: true });
      }
      this.indexes.clear();
      fs.mkdirSync(this.basePath, { recursive: true });
    } catch (error) {
      logger.error('Failed to clear Vectra indexes', error);
      throw error;
    }
  }
}
