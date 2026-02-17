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
