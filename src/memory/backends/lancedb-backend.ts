/**
 * LanceDB Vector Backend
 *
 * Persistent, disk-based vector storage using LanceDB.
 * One table per collection, stored under `<dataDir>/vectordb/`.
 *
 * Uses cosine distance metric so similarity scores are comparable
 * with the Vectra backend (both return cosine distance 0–2).
 *
 * @module memory/backends/lancedb-backend
 */

import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import type { VectorBackend, QueryResult } from '../vector-backend';
import { textToVector } from './text-hash';
import { createLogger } from '../../utils/logger';

const logger = createLogger();

export class LanceDbBackend implements VectorBackend {
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private tables: Map<string, lancedb.Table> = new Map();
  private connected = false;

  constructor(dataDir: string) {
    this.dbPath = path.join(dataDir, 'vectordb');
  }

  async initialize(): Promise<void> {
    try {
      this.db = await lancedb.connect(this.dbPath);
      this.connected = true;
      logger.info('LanceDB connected', { path: this.dbPath });
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async getOrCreateTable(collection: string): Promise<lancedb.Table> {
    if (this.tables.has(collection)) {
      return this.tables.get(collection)!;
    }
    if (!this.db) throw new Error('LanceDB not initialized');

    try {
      const table = await this.db.openTable(collection);
      this.tables.set(collection, table);
      return table;
    } catch {
      // Table doesn't exist — create with a seed row then delete it
      const seed = [
        {
          id: '__seed__',
          text: '',
          vector: textToVector('seed'),
          metadata: '{}',
        },
      ];
      const table = await this.db.createTable(collection, seed);
      await table.delete('id = \'__seed__\'');
      this.tables.set(collection, table);
      return table;
    }
  }

  async addDocuments(
    collection: string,
    ids: string[],
    documents: string[],
    metadatas: Record<string, any>[],
  ): Promise<void> {
    const table = await this.getOrCreateTable(collection);
    const rows = ids.map((id, i) => ({
      id,
      text: documents[i],
      vector: textToVector(documents[i]),
      metadata: JSON.stringify(metadatas[i]),
    }));
    await table.add(rows);
  }

  async query(
    collection: string,
    queryText: string,
    nResults: number,
    where?: Record<string, any>,
  ): Promise<QueryResult> {
    const table = await this.getOrCreateTable(collection);
    const count = await table.countRows();
    if (count === 0) return { ids: [], distances: [], metadatas: [] };

    const queryVec = textToVector(queryText || 'query');
    let q = table.vectorSearch(queryVec).distanceType('cosine').limit(nResults);

    if (where) {
      const clauses: string[] = [];
      for (const [key, val] of Object.entries(where)) {
        // Validate key is alphanumeric to prevent SQL injection
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          logger.warn('Skipping invalid filter key', { key });
          continue;
        }
        // Escape double quotes and LIKE wildcards in value
        const safeVal = String(val)
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/%/g, '\\%')
          .replace(/_/g, '\\_');
        clauses.push(`metadata LIKE '%"${key}":"${safeVal}"%'`);
      }
      if (clauses.length > 0) {
        q = q.where(clauses.join(' AND '));
      }
    }

    const results = await q.toArray();

    const ids: string[] = [];
    const distances: number[] = [];
    const metas: Record<string, any>[] = [];

    for (const row of results) {
      ids.push(row.id as string);
      // LanceDB with cosine distance returns 0–2 (same scale as 1-cosineSim)
      distances.push((row._distance as number) ?? 0);
      try {
        metas.push(JSON.parse(row.metadata as string));
      } catch {
        metas.push({});
      }
    }

    return { ids, distances, metadatas: metas };
  }

  async get(
    collection: string,
    ids: string[],
  ): Promise<{ metadatas: (Record<string, any> | null)[] }> {
    const table = await this.getOrCreateTable(collection);
    const metadatas: (Record<string, any> | null)[] = [];

    for (const id of ids) {
      const safeId = id.replace(/'/g, "''");
      const rows = await table
        .query()
        .where(`id = '${safeId}'`)
        .limit(1)
        .toArray();

      if (rows.length > 0) {
        try {
          metadatas.push(JSON.parse(rows[0].metadata as string));
        } catch {
          metadatas.push(null);
        }
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
    const table = await this.getOrCreateTable(collection);
    const safeId = id.replace(/'/g, "''");
    const rows = await table
      .query()
      .where(`id = '${safeId}'`)
      .limit(1)
      .toArray();

    if (rows.length === 0) return;

    const existing = rows[0];
    await table.delete(`id = '${safeId}'`);
    await table.add([
      {
        id,
        text: existing.text,
        vector: existing.vector,
        metadata: JSON.stringify(metadata),
      },
    ]);
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    const table = await this.getOrCreateTable(collection);
    for (const id of ids) {
      const safeId = id.replace(/'/g, "''");
      await table.delete(`id = '${safeId}'`);
    }
  }

  async count(collection: string): Promise<number> {
    try {
      const table = await this.getOrCreateTable(collection);
      return await table.countRows();
    } catch {
      return 0;
    }
  }

  async clear(): Promise<void> {
    if (!this.db) return;
    try {
      const names = await this.db.tableNames();
      for (const name of names) {
        await this.db.dropTable(name);
      }
      this.tables.clear();
    } catch (error) {
      logger.error('Failed to clear LanceDB tables', error);
      throw error;
    }
  }
}
