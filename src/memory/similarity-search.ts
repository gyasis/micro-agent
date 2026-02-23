/**
 * Similarity Search
 *
 * Advanced similarity search for retrieving relevant fix patterns from MemoryVault.
 * Uses semantic embeddings and context matching to find the top 5 most similar past fixes.
 *
 * @module memory/similarity-search
 */

import type { FixPattern } from '../agents/base/agent-context';
import { MemoryVault } from './memory-vault';
import { ErrorCategorizer, type CategorizedError } from './error-categorizer';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface SearchQuery {
  errorMessage: string;
  stackTrace?: string;
  context?: string[];
  codeSnippet?: string;
  category?: string;
}

export interface RankedFix {
  pattern: FixPattern;
  relevanceScore: number;
  matchReasons: string[];
}

export interface SearchOptions {
  maxResults?: number;
  minRelevanceScore?: number;
  categoryWeight?: number;
  contextWeight?: number;
  recencyWeight?: number;
}

const DEFAULT_OPTIONS: Required<SearchOptions> = {
  maxResults: 5,
  minRelevanceScore: 0.7,
  categoryWeight: 0.3,
  contextWeight: 0.5,
  recencyWeight: 0.2,
};

/**
 * Similarity search for fix patterns
 */
export class SimilaritySearch {
  private vault: MemoryVault;
  private categorizer: ErrorCategorizer;

  constructor(vault: MemoryVault) {
    this.vault = vault;
    this.categorizer = new ErrorCategorizer();
  }

  /**
   * Search for similar fixes
   */
  async search(
    query: SearchQuery,
    options: SearchOptions = {},
  ): Promise<RankedFix[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Categorize the error
    const categorized = this.categorizer.categorize(
      query.errorMessage,
      query.stackTrace,
      query.context,
    );

    logger.debug('Searching for similar fixes', {
      category: categorized.category,
      signature: categorized.signature,
    });

    // Search vault
    const results = await this.vault.searchFixPatterns(
      categorized.signature,
      categorized.context,
      opts.maxResults * 2, // Get more candidates for re-ranking
    );

    // Re-rank results
    const ranked = this.rankResults(
      results.map((r) => r.pattern),
      categorized,
      query,
      opts,
    );

    // Filter by minimum score and limit
    return ranked
      .filter((r) => r.relevanceScore >= opts.minRelevanceScore)
      .slice(0, opts.maxResults);
  }

  /**
   * Rank search results by relevance
   */
  private rankResults(
    patterns: FixPattern[],
    categorized: CategorizedError,
    query: SearchQuery,
    options: Required<SearchOptions>,
  ): RankedFix[] {
    const ranked: RankedFix[] = [];

    for (const pattern of patterns) {
      const matchReasons: string[] = [];
      let score = 0;

      // Category match (30% weight)
      const categoryMatch = this.categorizePattern(pattern);
      if (categoryMatch === categorized.category) {
        score += options.categoryWeight;
        matchReasons.push(`Same error category: ${categorized.category}`);
      }

      // Context overlap (50% weight)
      const contextScore = this.calculateContextOverlap(
        query.context || [],
        pattern.context,
      );
      score += contextScore * options.contextWeight;

      if (contextScore > 0.5) {
        matchReasons.push(
          `High context overlap: ${(contextScore * 100).toFixed(0)}%`,
        );
      }

      // Recency (20% weight)
      const recencyScore = this.calculateRecencyScore(pattern.lastUsed);
      score += recencyScore * options.recencyWeight;

      if (recencyScore > 0.7) {
        matchReasons.push('Recently used fix');
      }

      // Success rate bonus
      if (pattern.successRate > 0.8) {
        score *= 1.1; // 10% bonus
        matchReasons.push(
          `High success rate: ${(pattern.successRate * 100).toFixed(0)}%`,
        );
      }

      // Popularity bonus
      if (pattern.timesApplied > 5) {
        score *= 1.05; // 5% bonus
        matchReasons.push(`Proven solution (${pattern.timesApplied} uses)`);
      }

      ranked.push({
        pattern,
        relevanceScore: Math.min(score, 1.0), // Cap at 1.0
        matchReasons,
      });
    }

    // Sort by score descending
    return ranked.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Calculate context overlap between query and pattern
   */
  private calculateContextOverlap(
    queryContext: string[],
    patternContext: string[],
  ): number {
    if (queryContext.length === 0 || patternContext.length === 0) {
      return 0;
    }

    // Normalize context items
    const querySet = new Set(queryContext.map((c) => this.normalizeContext(c)));
    const patternSet = new Set(
      patternContext.map((c) => this.normalizeContext(c)),
    );

    // Calculate Jaccard similarity
    const intersection = new Set(
      [...querySet].filter((c) => patternSet.has(c)),
    );

    const union = new Set([...querySet, ...patternSet]);

    return intersection.size / union.size;
  }

  /**
   * Normalize context string
   */
  private normalizeContext(context: string): string {
    return context.toLowerCase().trim();
  }

  /**
   * Calculate recency score (more recent = higher score)
   */
  private calculateRecencyScore(lastUsed: Date): number {
    const now = Date.now();
    const age = now - lastUsed.getTime();
    const daysOld = age / (1000 * 60 * 60 * 24);

    // Exponential decay: 1.0 at 0 days, 0.5 at 30 days, approaching 0
    return Math.exp(-daysOld / 30);
  }

  /**
   * Categorize fix pattern based on signature
   */
  private categorizePattern(pattern: FixPattern): string {
    const categorized = this.categorizer.categorize(
      pattern.errorSignature,
      undefined,
      pattern.context,
    );

    return categorized.category;
  }

  /**
   * Get explanation for search results
   */
  explainResults(results: RankedFix[]): string {
    if (results.length === 0) {
      return 'No similar fixes found in memory vault.';
    }

    const lines: string[] = [];
    lines.push(`Found ${results.length} similar fix(es):\n`);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const rank = i + 1;

      lines.push(
        `${rank}. Relevance: ${(result.relevanceScore * 100).toFixed(0)}%`,
      );
      lines.push(
        `   Success Rate: ${(result.pattern.successRate * 100).toFixed(0)}%`,
      );
      lines.push(`   Times Applied: ${result.pattern.timesApplied}`);
      lines.push(`   Match Reasons:`);

      for (const reason of result.matchReasons) {
        lines.push(`     - ${reason}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get diverse results (avoid duplicates)
   */
  async searchDiverse(
    query: SearchQuery,
    options: SearchOptions = {},
  ): Promise<RankedFix[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Get initial results
    const results = await this.search(query, {
      ...opts,
      maxResults: opts.maxResults * 3, // Get more candidates
    });

    // Deduplicate by solution similarity
    const diverse: RankedFix[] = [];
    const seenSolutions = new Set<string>();

    for (const result of results) {
      const solutionKey = this.createSolutionKey(result.pattern.solution);

      if (!seenSolutions.has(solutionKey)) {
        diverse.push(result);
        seenSolutions.add(solutionKey);

        if (diverse.length >= opts.maxResults) {
          break;
        }
      }
    }

    return diverse;
  }

  /**
   * Create solution key for deduplication
   */
  private createSolutionKey(solution: string): string {
    // Normalize solution for comparison
    return solution
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/['"]/g, '')
      .substring(0, 100);
  }

  /**
   * Search by category only (T092: Optimized with vault-level filtering)
   */
  async searchByCategory(
    category: string,
    limit: number = 5,
  ): Promise<FixPattern[]> {
    // Use optimized vault-level category filtering (T092)
    const results = await this.vault.searchFixPatterns(
      '', // Empty signature matches all
      [], // Empty context
      limit,
      category, // Category filter at vault level
    );

    return results.map((r) => r.pattern);
  }

  /**
   * Get trending fixes (most used recently)
   */
  async getTrendingFixes(limit: number = 5): Promise<FixPattern[]> {
    // Get recent patterns
    const results = await this.vault.searchFixPatterns('', [], limit * 2);

    // Sort by recent usage and popularity
    return results
      .map((r) => r.pattern)
      .sort((a, b) => {
        const scoreA = a.timesApplied * this.calculateRecencyScore(a.lastUsed);
        const scoreB = b.timesApplied * this.calculateRecencyScore(b.lastUsed);
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  /**
   * Get most reliable fixes (highest success rate)
   */
  async getMostReliableFixes(limit: number = 5): Promise<FixPattern[]> {
    const results = await this.vault.searchFixPatterns('', [], limit * 2);

    return results
      .map((r) => r.pattern)
      .filter((p) => p.timesApplied >= 3) // Minimum sample size
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit);
  }
}
