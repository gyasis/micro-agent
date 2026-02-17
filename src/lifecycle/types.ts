/**
 * Type definitions for Ralph Loop iteration lifecycle
 *
 * @module lifecycle/types
 */

export interface SessionConfig {
  sessionId: string;
  projectRoot: string;
  targetFile: string;
  language: 'typescript' | 'javascript' | 'python' | 'rust';
  testFramework?: string;
}

export interface IterationState {
  iteration: number;
  timestamp: number;
  codebasHash: string; // Git commit or file hash
  testResults: TestResults | null;
  contextUsage: ContextUsage;
  agentOutputs: AgentOutput[];
}

export interface TestResults {
  status: 'pass' | 'fail' | 'error' | 'timeout';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
  coverage?: Coverage;
  failures: TestFailure[];
}

export interface TestFailure {
  testName: string;
  errorType: string;
  errorMessage: string;
  stackTrace: string;
  sourceLocation?: {
    file: string;
    line: number;
    column: number;
  };
}

export interface Coverage {
  linePercentage: number;
  branchPercentage: number;
  functionPercentage: number;
  statementPercentage: number;
}

export interface ContextUsage {
  agent: string;
  model: string;
  totalTokens: number;
  contextWindowSize: number;
  usagePercentage: number; // totalTokens / contextWindowSize * 100
}

export interface AgentOutput {
  agent: 'librarian' | 'artisan' | 'critic' | 'chaos';
  timestamp: number;
  input: string;
  output: string;
  tokensUsed: number;
  cost: number;
  success: boolean;
  error?: string;
}

export interface IterationResult {
  iteration: number;
  state: IterationState;
  status: 'success' | 'budget_exceeded' | 'entropy_detected' | 'max_iterations' | 'error';
  message: string;
  nextSteps?: string[];
}

export interface DiskState {
  gitWorkingTree: Map<string, string>; // file path -> content
  testResults: TestResults | null;
  sessionLog: SessionLogEntry[];
}

export interface SessionLogEntry {
  iteration: number;
  timestamp: number;
  event: string;
  data: any;
}

// ============================================================
// Simple Mode & Escalation Types (002-simple-escalation)
// ============================================================

/**
 * Record of a single simple mode iteration attempt.
 * Accumulated in-memory during the simple loop.
 */
export interface SimpleIterationRecord {
  iteration: number;              // 1-based attempt number
  codeChangeSummary: string;      // What the Artisan changed (from ArtisanOutput.reasoning)
  testStatus: 'passed' | 'failed' | 'error';
  failedTests: string[];          // Test names that failed
  errorMessages: string[];        // Unique error messages from this iteration
  duration: number;               // ms
  cost: number;                   // USD
}

/**
 * Compressed record of all simple mode attempts.
 * Passed as starting context to full mode Librarian on escalation.
 */
export interface FailureSummary {
  totalSimpleIterations: number;
  totalSimpleCost: number;            // USD
  records: SimpleIterationRecord[];
  uniqueErrorSignatures: string[];    // Deduplicated error patterns
  finalTestState: {
    totalTests: number;
    failedTests: string[];
    lastErrorMessages: string[];
  };
  naturalLanguageSummary: string;     // Plain text block for Librarian prompt injection
}

/**
 * Snapshot of the escalation handoff moment.
 */
export interface EscalationEvent {
  triggeredAt: Date;
  reason: 'iterations-exhausted';
  simpleIterationsRun: number;
  remainingBudget: {
    costUsd: number;
    timeMinutes: number;
    iterations: number;
  };
  failureSummary: FailureSummary;
}

// ============================================================
// Multi-Tier Escalation Types (003-tiered-escalation)
// ============================================================

export interface TierModels {
  artisan: string;
  librarian?: string;
  critic?: string;
}

export interface TierConfig {
  name: string;
  mode: 'simple' | 'full';
  maxIterations: number;
  models: TierModels;
}

export interface TierGlobal {
  auditDbPath?: string;
  maxTotalCostUsd?: number;
  maxTotalDurationMinutes?: number;
}

export interface TierEscalationConfig {
  tiers: TierConfig[];
  global?: TierGlobal;
}

export interface TierAttemptRecord {
  runId: string;
  tierIndex: number;
  tierName: string;
  tierMode: 'simple' | 'full';
  modelArtisan: string;
  modelLibrarian: string | null;
  modelCritic: string | null;
  iteration: number;
  codeChangeSummary: string;
  testStatus: 'passed' | 'failed' | 'error';
  failedTests: string[];
  errorMessages: string[];
  costUsd: number;
  durationMs: number;
  timestamp: string;
}

export interface RunMetadataRow {
  runId: string;
  objective: string;
  workingDirectory: string;
  testCommand: string;
  tierConfigPath: string;
  startedAt: string;
  completedAt?: string;
  outcome?: 'success' | 'failed' | 'budget_exhausted' | 'in_progress';
  resolvedTierName?: string;
  resolvedIteration?: number;
}

export interface AccumulatedFailureSummary {
  naturalLanguageSummary: string;
  totalIterationsAcrossTiers: number;
  totalCostUsdAcrossTiers: number;
  allUniqueErrorSignatures: string[];
  lastFailedTests: string[];
}

export interface TierRunResult {
  tierName: string;
  tierIndex: number;
  success: boolean;
  iterationsRan: number;
  totalCostUsd: number;
  records: TierAttemptRecord[];
  exitReason: 'success' | 'iterations_exhausted' | 'budget_exhausted' | 'provider_error';
}
