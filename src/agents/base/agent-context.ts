/**
 * Shared Agent Context
 *
 * Common context structure shared across all Ralph Loop agents.
 * Contains iteration state, file context, and test information.
 *
 * @module agents/base/agent-context
 */

export interface FileContext {
  path: string;
  content: string;
  relevanceScore?: number;
  dependencies?: string[];
  lastModified?: Date;
}

export interface TestContext {
  command: string;
  framework: 'vitest' | 'jest' | 'pytest' | 'cargo' | 'custom';
  pattern?: string;
  lastResult?: TestResult;
}

export interface TestResult {
  passed: boolean;
  failures: TestFailure[];
  coverage?: CoverageStats;
  duration: number;
  timestamp: Date;
}

export interface TestFailure {
  testName: string;
  filePath: string;
  errorMessage: string;
  stackTrace?: string;
  line?: number;
  column?: number;
}

export interface CoverageStats {
  lines: { covered: number; total: number; percentage: number };
  statements: { covered: number; total: number; percentage: number };
  functions: { covered: number; total: number; percentage: number };
  branches: { covered: number; total: number; percentage: number };
}

export interface IterationState {
  iteration: number;
  maxIterations: number;
  objective: string;
  currentPhase: 'context' | 'generation' | 'review' | 'testing' | 'adversarial';
  previousAttempts: number;
  entropy: Map<string, number>;
}

export interface BudgetConstraints {
  maxCostUsd: number;
  currentCostUsd: number;
  maxDurationMinutes: number;
  startTime: Date;
}

export interface MemoryContext {
  fixPatterns: FixPattern[];
  testPatterns: TestPattern[];
  relevantPatterns: string[];
}

export interface FixPattern {
  id: string;
  errorSignature: string;
  solution: string;
  context: string[];
  successRate: number;
  timesApplied: number;
  lastUsed: Date;
  category?: string; // Optional category for filtering (syntax, logic, runtime, etc.)
}

export interface TestPattern {
  id: string;
  testType: 'unit' | 'integration' | 'adversarial' | 'property';
  pattern: string;
  framework: string;
  examples: string[];
}

/**
 * Complete agent context
 * Passed to all agents during initialization and execution
 */
export interface AgentContext {
  // Session information
  sessionId: string;
  iteration: IterationState;
  budget: BudgetConstraints;

  // Project context
  workingDirectory: string;
  targetFile?: string;
  relatedFiles: FileContext[];

  // Objective and requirements
  objective: string;
  requirements?: string[];
  constraints?: string[];

  // Testing context
  test: TestContext;

  // Memory and patterns
  memory?: MemoryContext;

  // Previous agent outputs (for agent coordination)
  librarianContext?: LibrarianOutput;
  artisanCode?: ArtisanOutput;
  criticReview?: CriticOutput;

  // Additional context
  metadata?: Record<string, any>;

  // Escalation context: plain text failure summary from simple mode (if escalated from simple → full)
  escalationContext?: string;
}

/**
 * Librarian agent output
 * Context analysis and file ranking
 */
export interface LibrarianOutput {
  relevantFiles: FileContext[];
  dependencyGraph: DependencyNode[];
  contextSummary: string;
  tokensUsed: number;
  cost: number;
}

export interface DependencyNode {
  file: string;
  imports: string[];
  exports: string[];
  dependsOn: string[];
  dependedBy: string[];
  distance: number;
}

/**
 * Artisan agent output
 * Code generation result
 */
export interface ArtisanOutput {
  code: string;
  filePath: string;
  changes: CodeChange[];
  reasoning: string;
  tokensUsed: number;
  cost: number;
}

export interface CodeChange {
  type: 'create' | 'modify' | 'delete';
  file: string;
  before?: string;
  after?: string;
  description: string;
}

/**
 * Critic agent output
 * Logic review and suggestions
 */
export interface CriticOutput {
  approved: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
  overallAssessment: string;
  tokensUsed: number;
  cost: number;
}

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'logic' | 'edge-case' | 'performance' | 'maintainability' | 'security';
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

/**
 * Chaos agent output
 * Adversarial test results
 */
export interface ChaosOutput {
  tests: AdversarialTest[];
  edgeCases: string[];
  vulnerabilities: string[];
  passed: boolean;
  tokensUsed: number;
  cost: number;
}

export interface AdversarialTest {
  name: string;
  type: 'boundary' | 'mutation' | 'property' | 'race-condition';
  passed: boolean;
  input?: any;
  expectedOutput?: any;
  actualOutput?: any;
  error?: string;
}

/**
 * Create initial agent context
 */
export function createAgentContext(options: {
  sessionId: string;
  iteration: number;
  maxIterations: number;
  objective: string;
  workingDirectory: string;
  testCommand: string;
  testFramework: TestContext['framework'];
  maxCostUsd: number;
  maxDurationMinutes: number;
  targetFile?: string;
  requirements?: string[];
}): AgentContext {
  return {
    sessionId: options.sessionId,
    iteration: {
      iteration: options.iteration,
      maxIterations: options.maxIterations,
      objective: options.objective,
      currentPhase: 'context',
      previousAttempts: 0,
      entropy: new Map(),
    },
    budget: {
      maxCostUsd: options.maxCostUsd,
      currentCostUsd: 0,
      maxDurationMinutes: options.maxDurationMinutes,
      startTime: new Date(),
    },
    workingDirectory: options.workingDirectory,
    targetFile: options.targetFile,
    relatedFiles: [],
    objective: options.objective,
    requirements: options.requirements,
    test: {
      command: options.testCommand,
      framework: options.testFramework,
    },
  };
}

/**
 * Update agent context with new phase
 */
export function updatePhase(
  context: AgentContext,
  phase: IterationState['currentPhase']
): AgentContext {
  return {
    ...context,
    iteration: {
      ...context.iteration,
      currentPhase: phase,
    },
  };
}

/**
 * Update agent context with librarian output
 */
export function withLibrarianContext(
  context: AgentContext,
  librarianOutput: LibrarianOutput
): AgentContext {
  return {
    ...context,
    librarianContext: librarianOutput,
    relatedFiles: librarianOutput.relevantFiles,
    budget: {
      ...context.budget,
      currentCostUsd: context.budget.currentCostUsd + librarianOutput.cost,
    },
  };
}

/**
 * Update agent context with artisan output
 */
export function withArtisanCode(
  context: AgentContext,
  artisanOutput: ArtisanOutput
): AgentContext {
  return {
    ...context,
    artisanCode: artisanOutput,
    budget: {
      ...context.budget,
      currentCostUsd: context.budget.currentCostUsd + artisanOutput.cost,
    },
  };
}

/**
 * Update agent context with critic output
 */
export function withCriticReview(
  context: AgentContext,
  criticOutput: CriticOutput
): AgentContext {
  return {
    ...context,
    criticReview: criticOutput,
    budget: {
      ...context.budget,
      currentCostUsd: context.budget.currentCostUsd + criticOutput.cost,
    },
  };
}

/**
 * Update agent context with test results
 */
export function withTestResults(
  context: AgentContext,
  testResults: any // RalphTestResult from parsers
): AgentContext {
  // Convert RalphTestResult to TestResult
  const failures: TestFailure[] = testResults.tests
    .filter((t: any) => t.status === 'failed' || t.status === 'error')
    .map((t: any) => ({
      testName: t.name,
      filePath: t.file,
      errorMessage: t.error?.message || 'Unknown error',
      stackTrace: t.error?.stack,
      line: t.error?.location?.line,
      column: t.error?.location?.column,
    }));

  const coverage: CoverageStats | undefined = testResults.coverage
    ? {
        lines: {
          covered: testResults.coverage.lines.covered,
          total: testResults.coverage.lines.total,
          percentage: testResults.coverage.lines.percentage,
        },
        statements: {
          covered: testResults.coverage.statements.covered,
          total: testResults.coverage.statements.total,
          percentage: testResults.coverage.statements.percentage,
        },
        functions: {
          covered: testResults.coverage.functions.covered,
          total: testResults.coverage.functions.total,
          percentage: testResults.coverage.functions.percentage,
        },
        branches: {
          covered: testResults.coverage.branches.covered,
          total: testResults.coverage.branches.total,
          percentage: testResults.coverage.branches.percentage,
        },
      }
    : undefined;

  return {
    ...context,
    test: {
      ...context.test,
      lastResult: {
        passed: testResults.summary.status === 'passed',
        failures,
        coverage,
        duration: testResults.summary.duration,
        timestamp: new Date(testResults.timestamp),
      },
    },
  };
}

/**
 * Check if budget is exceeded
 */
export function isBudgetExceeded(context: AgentContext): boolean {
  const costExceeded = context.budget.currentCostUsd >= context.budget.maxCostUsd;

  const elapsed = (Date.now() - context.budget.startTime.getTime()) / (1000 * 60);
  const timeExceeded = elapsed >= context.budget.maxDurationMinutes;

  // Note: Iteration count is checked by the while loop condition, not here
  // Checking it here causes false positives (e.g., iteration 1 with maxIterations=1)

  return costExceeded || timeExceeded;
}

/**
 * Update agent context with escalation context from simple mode failure summary
 */
export function withEscalationContext(
  context: AgentContext,
  naturalLanguageSummary: string
): AgentContext {
  return {
    ...context,
    escalationContext: naturalLanguageSummary,
  };
}
