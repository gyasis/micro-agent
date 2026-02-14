/**
 * Review Validation Checker
 *
 * Validates code review quality and ensures comprehensive coverage.
 * Checks that reviews address all critical areas and provide actionable feedback.
 *
 * @module agents/critic/review-checker
 */

import type { ReviewIssue, CriticOutput } from '../base/agent-context';

export interface ReviewQuality {
  comprehensive: boolean;
  actionable: boolean;
  balanced: boolean;
  score: number;
  missingAreas: string[];
  warnings: string[];
}

export interface ReviewCoverage {
  hasLogicCheck: boolean;
  hasEdgeCaseCheck: boolean;
  hasSecurityCheck: boolean;
  hasPerformanceCheck: boolean;
  hasMaintainabilityCheck: boolean;
  coveragePercent: number;
}

/**
 * Validate review quality
 */
export function validateReview(review: CriticOutput): ReviewQuality {
  const coverage = checkCoverage(review);
  const actionability = checkActionability(review);
  const balance = checkBalance(review);

  const score = calculateQualityScore(coverage, actionability, balance);
  const missingAreas = identifyMissingAreas(coverage);
  const warnings = generateWarnings(review, coverage, actionability, balance);

  return {
    comprehensive: coverage.coveragePercent >= 80,
    actionable: actionability >= 0.7,
    balanced: balance,
    score,
    missingAreas,
    warnings,
  };
}

/**
 * Check review coverage
 */
export function checkCoverage(review: CriticOutput): ReviewCoverage {
  const issues = review.issues;

  const hasLogicCheck = issues.some(i => i.category === 'logic');
  const hasEdgeCaseCheck = issues.some(i => i.category === 'edge-case');
  const hasSecurityCheck = issues.some(i => i.category === 'security');
  const hasPerformanceCheck = issues.some(i => i.category === 'performance');
  const hasMaintainabilityCheck = issues.some(i => i.category === 'maintainability');

  const checks = [
    hasLogicCheck,
    hasEdgeCaseCheck,
    hasSecurityCheck,
    hasPerformanceCheck,
    hasMaintainabilityCheck,
  ];

  const coveragePercent = (checks.filter(Boolean).length / checks.length) * 100;

  return {
    hasLogicCheck,
    hasEdgeCaseCheck,
    hasSecurityCheck,
    hasPerformanceCheck,
    hasMaintainabilityCheck,
    coveragePercent,
  };
}

/**
 * Check if review is actionable (provides specific suggestions)
 */
function checkActionability(review: CriticOutput): number {
  const issuesWithSuggestions = review.issues.filter(i => i.suggestion).length;
  const totalIssues = review.issues.length;

  if (totalIssues === 0) return 1.0; // No issues = fully actionable

  return issuesWithSuggestions / totalIssues;
}

/**
 * Check if review is balanced (not too harsh or too lenient)
 */
function checkBalance(review: CriticOutput): boolean {
  const issues = review.issues;

  // Count by severity
  const critical = issues.filter(i => i.severity === 'critical').length;
  const warning = issues.filter(i => i.severity === 'warning').length;
  const info = issues.filter(i => i.severity === 'info').length;

  // Too harsh: mostly critical issues
  if (critical > warning + info && critical > 5) {
    return false;
  }

  // Too lenient: no critical or warnings despite clear issues
  if (critical === 0 && warning === 0 && !review.approved) {
    return false;
  }

  return true;
}

/**
 * Calculate overall quality score (0-1)
 */
function calculateQualityScore(
  coverage: ReviewCoverage,
  actionability: number,
  balance: boolean
): number {
  const coverageScore = coverage.coveragePercent / 100;
  const balanceScore = balance ? 1.0 : 0.5;

  return (coverageScore * 0.4 + actionability * 0.4 + balanceScore * 0.2);
}

/**
 * Identify missing coverage areas
 */
function identifyMissingAreas(coverage: ReviewCoverage): string[] {
  const missing: string[] = [];

  if (!coverage.hasLogicCheck) missing.push('Logic analysis');
  if (!coverage.hasEdgeCaseCheck) missing.push('Edge case handling');
  if (!coverage.hasSecurityCheck) missing.push('Security review');
  if (!coverage.hasPerformanceCheck) missing.push('Performance assessment');
  if (!coverage.hasMaintainabilityCheck) missing.push('Maintainability evaluation');

  return missing;
}

/**
 * Generate warnings about review quality
 */
function generateWarnings(
  review: CriticOutput,
  coverage: ReviewCoverage,
  actionability: number,
  balance: boolean
): string[] {
  const warnings: string[] = [];

  // Coverage warnings
  if (coverage.coveragePercent < 60) {
    warnings.push('Review coverage is low - consider re-review with focus on missing areas');
  }

  // Actionability warnings
  if (actionability < 0.5) {
    warnings.push('Many issues lack specific suggestions - review may not be actionable');
  }

  // Balance warnings
  if (!balance) {
    warnings.push('Review appears unbalanced - may be too harsh or too lenient');
  }

  // Approval consistency
  if (review.approved && review.issues.some(i => i.severity === 'critical')) {
    warnings.push('Code approved despite critical issues - inconsistent decision');
  }

  if (!review.approved && review.issues.length === 0) {
    warnings.push('Code rejected but no issues found - unclear reasoning');
  }

  // Assessment quality
  if (!review.overallAssessment || review.overallAssessment.length < 20) {
    warnings.push('Overall assessment is missing or too brief');
  }

  return warnings;
}

/**
 * Check if critical issues are blocking
 */
export function hasBlockingIssues(review: CriticOutput): boolean {
  return review.issues.some(
    i => i.severity === 'critical' && (i.category === 'logic' || i.category === 'security')
  );
}

/**
 * Get issues by category
 */
export function getIssuesByCategory(review: CriticOutput): Map<string, ReviewIssue[]> {
  const byCategory = new Map<string, ReviewIssue[]>();

  for (const issue of review.issues) {
    const category = issue.category;
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(issue);
  }

  return byCategory;
}

/**
 * Get issues by severity
 */
export function getIssuesBySeverity(review: CriticOutput): Map<string, ReviewIssue[]> {
  const bySeverity = new Map<string, ReviewIssue[]>();

  for (const issue of review.issues) {
    const severity = issue.severity;
    if (!bySeverity.has(severity)) {
      bySeverity.set(severity, []);
    }
    bySeverity.get(severity)!.push(issue);
  }

  return bySeverity;
}

/**
 * Format review summary for logging
 */
export function formatReviewSummary(review: CriticOutput): string {
  const parts: string[] = [];

  parts.push(`Review Status: ${review.approved ? 'APPROVED' : 'REJECTED'}`);

  const bySeverity = getIssuesBySeverity(review);
  const critical = bySeverity.get('critical')?.length || 0;
  const warning = bySeverity.get('warning')?.length || 0;
  const info = bySeverity.get('info')?.length || 0;

  parts.push(`Issues: ${critical} critical, ${warning} warnings, ${info} info`);

  const byCategory = getIssuesByCategory(review);
  const categories = Array.from(byCategory.keys()).map(
    cat => `${cat}: ${byCategory.get(cat)!.length}`
  );

  if (categories.length > 0) {
    parts.push(`By category: ${categories.join(', ')}`);
  }

  parts.push(`Assessment: ${review.overallAssessment}`);

  if (review.suggestions.length > 0) {
    parts.push(`Suggestions:\n  - ${review.suggestions.join('\n  - ')}`);
  }

  return parts.join('\n');
}

/**
 * Validate that code addresses previous review issues
 */
export function validateIssuesAddressed(
  previousReview: CriticOutput,
  currentReview: CriticOutput
): {
  addressed: number;
  remaining: number;
  new: number;
  details: string[];
} {
  const previousIssues = new Set(
    previousReview.issues.map(i => `${i.category}:${i.message}`)
  );

  const currentIssues = new Set(
    currentReview.issues.map(i => `${i.category}:${i.message}`)
  );

  const addressed = [...previousIssues].filter(i => !currentIssues.has(i)).length;
  const remaining = [...previousIssues].filter(i => currentIssues.has(i)).length;
  const newIssues = [...currentIssues].filter(i => !previousIssues.has(i)).length;

  const details: string[] = [];

  if (addressed > 0) {
    details.push(`${addressed} issue(s) resolved from previous review`);
  }

  if (remaining > 0) {
    details.push(`${remaining} issue(s) still present from previous review`);
  }

  if (newIssues > 0) {
    details.push(`${newIssues} new issue(s) introduced`);
  }

  return { addressed, remaining, new: newIssues, details };
}

/**
 * Check if review meets minimum quality threshold
 */
export function meetsQualityThreshold(review: CriticOutput, minScore: number = 0.7): boolean {
  const quality = validateReview(review);
  return quality.score >= minScore && quality.warnings.length === 0;
}

/**
 * Suggest review improvements
 */
export function suggestImprovements(quality: ReviewQuality): string[] {
  const suggestions: string[] = [];

  if (!quality.comprehensive) {
    suggestions.push(`Review missing areas: ${quality.missingAreas.join(', ')}`);
  }

  if (!quality.actionable) {
    suggestions.push('Add specific suggestions for each issue');
  }

  if (!quality.balanced) {
    suggestions.push('Balance severity assessments - avoid extremes');
  }

  for (const warning of quality.warnings) {
    suggestions.push(warning);
  }

  return suggestions;
}
