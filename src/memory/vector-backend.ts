/**
 * Vector Backend Interface
 *
 * Common abstraction over vector databases (LanceDB, Vectra).
 * MemoryVault programs against this interface so the underlying
 * storage engine can be swapped without touching business logic.
 *
 * @module memory/vector-backend
 */

export interface QueryResult {
  ids: string[];
  distances: number[];
  metadatas: Record<string, any>[];
}

export interface VectorBackend {
  /** Connect / create tables. Throws on unrecoverable failure. */
  initialize(): Promise<void>;

  /** True after a successful initialize(). */
  isConnected(): boolean;

  /** Add documents with metadata to a named collection. */
  addDocuments(
    collection: string,
    ids: string[],
    documents: string[],
    metadatas: Record<string, any>[],
  ): Promise<void>;

  /** Semantic-ish query against a collection. */
  query(
    collection: string,
    queryText: string,
    nResults: number,
    where?: Record<string, any>,
  ): Promise<QueryResult>;

  /** Get a single document by id. */
  get(
    collection: string,
    ids: string[],
  ): Promise<{ metadatas: (Record<string, any> | null)[] }>;

  /** Update metadata for a document. */
  update(
    collection: string,
    id: string,
    metadata: Record<string, any>,
  ): Promise<void>;

  /** Delete documents by id. */
  delete(collection: string, ids: string[]): Promise<void>;

  /** Count documents in a collection. */
  count(collection: string): Promise<number>;

  /** Drop all collections and re-initialize. */
  clear(): Promise<void>;
}
