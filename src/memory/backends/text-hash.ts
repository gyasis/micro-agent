/**
 * Simple Text Hash Embedding
 *
 * Deterministic text → float[] hash for basic vector similarity.
 * NOT a real embedding model — produces usable cosine similarity
 * for short strings (<200 chars). Longer strings converge due to
 * character frequency averaging, reducing discriminative power.
 *
 * Shared by both LanceDB and Vectra backends to ensure vectors
 * are compatible across backend switches.
 *
 * @module memory/backends/text-hash
 */

/** Dimensionality of hash vectors. */
export const VECTOR_DIM = 64;

/**
 * Deterministic text → normalized float[] hash.
 *
 * Limitations:
 * - Strings >200 chars produce similar vectors (frequency convergence).
 * - Empty string returns a zero vector (norm guarded to 1).
 * - Not suitable for semantic similarity — only lexical overlap.
 */
export function textToVector(text: string): number[] {
  const vec = new Float64Array(VECTOR_DIM).fill(0);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    const idx = i % VECTOR_DIM;
    vec[idx] += normalized.charCodeAt(i) / 256;
  }
  // L2-normalize
  let norm = 0;
  for (let i = 0; i < VECTOR_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const result: number[] = [];
  for (let i = 0; i < VECTOR_DIM; i++) result.push(vec[i] / norm);
  return result;
}
