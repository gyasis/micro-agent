/**
 * File Ranker
 *
 * Ranks files by relevance using multiple criteria:
 * - Distance from target file in dependency graph
 * - Recency of modifications
 * - Size and complexity
 * - LLM-based relevance scoring
 *
 * @module agents/librarian/file-ranker
 */

import type { FileContext } from '../base/agent-context';
import type { DependencyGraph, DependencyInfo } from './dependency-graph';
import { calculateDistances } from './dependency-graph';

export interface RankingCriteria {
  distanceWeight: number;
  recencyWeight: number;
  complexityWeight: number;
  llmScoreWeight: number;
}

export interface FileRanking {
  file: FileContext;
  totalScore: number;
  distanceScore: number;
  recencyScore: number;
  complexityScore: number;
  llmScore?: number;
}

const DEFAULT_CRITERIA: RankingCriteria = {
  distanceWeight: 0.4,
  recencyWeight: 0.2,
  complexityWeight: 0.1,
  llmScoreWeight: 0.3,
};

/**
 * Rank files by multiple criteria
 */
export function rankFiles(
  files: FileContext[],
  graph: DependencyGraph,
  targetFile: string | undefined,
  criteria: Partial<RankingCriteria> = {},
): FileRanking[] {
  const weights = { ...DEFAULT_CRITERIA, ...criteria };
  const rankings: FileRanking[] = [];

  // Calculate distance scores
  const distances = targetFile
    ? calculateDistances(graph, targetFile)
    : new Map();

  for (const file of files) {
    const distanceScore = calculateDistanceScore(file.path, distances);
    const recencyScore = calculateRecencyScore(file.lastModified);
    const complexityScore = calculateComplexityScore(file.content);
    const llmScore = file.relevanceScore; // Set by Librarian LLM call

    const totalScore =
      distanceScore * weights.distanceWeight +
      recencyScore * weights.recencyWeight +
      complexityScore * weights.complexityWeight +
      (llmScore || 0) * weights.llmScoreWeight;

    rankings.push({
      file,
      totalScore,
      distanceScore,
      recencyScore,
      complexityScore,
      llmScore,
    });
  }

  return rankings.sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Calculate distance score (closer = higher score)
 */
function calculateDistanceScore(
  filePath: string,
  distances: Map<string, number>,
): number {
  const distance = distances.get(filePath);
  if (distance === undefined) return 0;

  // Normalize: distance 0 = 1.0, distance 5+ = 0.0
  return Math.max(0, 1.0 - distance / 5);
}

/**
 * Calculate recency score (more recent = higher score)
 */
function calculateRecencyScore(lastModified: Date | undefined): number {
  if (!lastModified) return 0.5;

  const now = Date.now();
  const age = now - lastModified.getTime();

  // Normalize: 0-7 days = 1.0, 30+ days = 0.0
  const daysOld = age / (1000 * 60 * 60 * 24);
  return Math.max(0, 1.0 - daysOld / 30);
}

/**
 * Calculate complexity score
 * Higher complexity = lower score (prioritize simple files)
 */
function calculateComplexityScore(content: string): number {
  const lines = content.split('\n').length;
  const functions = (content.match(/function\s+\w+/g) || []).length;
  const classes = (content.match(/class\s+\w+/g) || []).length;

  // Complexity metrics
  const lineComplexity = Math.min(lines / 500, 1.0); // 500+ lines = max complexity
  const functionComplexity = Math.min(functions / 20, 1.0); // 20+ functions = max
  const classComplexity = Math.min(classes / 5, 1.0); // 5+ classes = max

  const avgComplexity =
    (lineComplexity + functionComplexity + classComplexity) / 3;

  // Invert: simpler files get higher scores
  return 1.0 - avgComplexity;
}

/**
 * Rank files by distance from target only
 */
export function rankByDistance(
  files: FileContext[],
  graph: DependencyGraph,
  targetFile: string,
): FileRanking[] {
  const distances = calculateDistances(graph, targetFile);

  return files
    .map((file) => {
      const distanceScore = calculateDistanceScore(file.path, distances);
      return {
        file,
        totalScore: distanceScore,
        distanceScore,
        recencyScore: 0,
        complexityScore: 0,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Get top N most relevant files
 */
export function getTopFiles(
  rankings: FileRanking[],
  count: number,
): FileContext[] {
  return rankings.slice(0, count).map((r) => r.file);
}

/**
 * Filter files by minimum score threshold
 */
export function filterByThreshold(
  rankings: FileRanking[],
  threshold: number,
): FileRanking[] {
  return rankings.filter((r) => r.totalScore >= threshold);
}

/**
 * Group files by score ranges
 */
export function groupByScoreRange(rankings: FileRanking[]): {
  high: FileRanking[]; // 0.7+
  medium: FileRanking[]; // 0.4-0.7
  low: FileRanking[]; // 0-0.4
} {
  return {
    high: rankings.filter((r) => r.totalScore >= 0.7),
    medium: rankings.filter((r) => r.totalScore >= 0.4 && r.totalScore < 0.7),
    low: rankings.filter((r) => r.totalScore < 0.4),
  };
}

/**
 * Calculate ranking statistics
 */
export function getRankingStats(rankings: FileRanking[]): {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
} {
  if (rankings.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 };
  }

  const scores = rankings.map((r) => r.totalScore);
  const sorted = [...scores].sort((a, b) => a - b);

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const variance =
    scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) /
    scores.length;
  const stdDev = Math.sqrt(variance);

  return { mean, median, min, max, stdDev };
}

/**
 * Explain ranking for a specific file
 */
export function explainRanking(ranking: FileRanking): string {
  const parts: string[] = [];

  parts.push(`Total score: ${ranking.totalScore.toFixed(2)}`);
  parts.push(
    `  Distance: ${ranking.distanceScore.toFixed(2)} (closer is better)`,
  );
  parts.push(`  Recency: ${ranking.recencyScore.toFixed(2)} (newer is better)`);
  parts.push(
    `  Complexity: ${ranking.complexityScore.toFixed(2)} (simpler is better)`,
  );

  if (ranking.llmScore !== undefined) {
    parts.push(`  LLM relevance: ${ranking.llmScore.toFixed(2)}`);
  }

  return parts.join('\n');
}

/**
 * Re-rank files with LLM scores
 */
export function reRankWithLLMScores(
  rankings: FileRanking[],
  llmScores: Map<string, number>,
  criteria: Partial<RankingCriteria> = {},
): FileRanking[] {
  const weights = { ...DEFAULT_CRITERIA, ...criteria };

  const reRanked = rankings.map((ranking) => {
    const llmScore = llmScores.get(ranking.file.path) || 0;

    const totalScore =
      ranking.distanceScore * weights.distanceWeight +
      ranking.recencyScore * weights.recencyWeight +
      ranking.complexityScore * weights.complexityWeight +
      llmScore * weights.llmScoreWeight;

    return {
      ...ranking,
      llmScore,
      totalScore,
    };
  });

  return reRanked.sort((a, b) => b.totalScore - a.totalScore);
}
