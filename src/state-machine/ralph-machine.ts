/**
 * Ralph Loop State Machine
 *
 * XState-based workflow orchestration for multi-agent iteration.
 * States: librarian → artisan → critic → testing → adversarial → completion
 *
 * CRITICAL: This machine executes WITHIN a single iteration.
 * After completion, the machine is destroyed and a fresh instance
 * is created for the next iteration.
 *
 * @module state-machine/ralph-machine
 */

import { createMachine, assign } from 'xstate';

export interface RalphContext {
  sessionId: string;
  iteration: number;
  targetFile: string;
  codebaseFiles: Map<string, string>;
  testResults: any | null;
  librarianOutput: any | null;
  artisanOutput: any | null;
  criticOutput: any | null;
  adversarialResults: any | null;
  errors: string[];
  contextUsage: Map<string, number>;
}

export type RalphEvent =
  | { type: 'START'; targetFile: string }
  | { type: 'LIBRARIAN_SUCCESS'; output: any }
  | { type: 'LIBRARIAN_ERROR'; error: string }
  | { type: 'ARTISAN_SUCCESS'; output: any }
  | { type: 'ARTISAN_ERROR'; error: string }
  | { type: 'CRITIC_SUCCESS'; output: any }
  | { type: 'CRITIC_ERROR'; error: string }
  | { type: 'TESTS_PASS'; results: any }
  | { type: 'TESTS_FAIL'; results: any }
  | { type: 'ADVERSARIAL_SUCCESS'; results: any }
  | { type: 'ADVERSARIAL_FAIL'; results: any }
  | { type: 'BUDGET_EXCEEDED' }
  | { type: 'ENTROPY_DETECTED' }
  | { type: 'CONTEXT_RESET_REQUIRED' };

/**
 * Ralph Loop State Machine Definition
 */
export const ralphMachine = createMachine(
  {
    id: 'ralph-loop',
    initial: 'librarian',
    context: {
      sessionId: '',
      iteration: 0,
      targetFile: '',
      codebaseFiles: new Map(),
      testResults: null,
      librarianOutput: null,
      artisanOutput: null,
      criticOutput: null,
      adversarialResults: null,
      errors: [],
      contextUsage: new Map(),
    } as RalphContext,
    states: {
      librarian: {
        on: {
          LIBRARIAN_SUCCESS: {
            target: 'artisan',
            actions: assign({
              librarianOutput: ({ event }) => event.output,
            }),
          },
          LIBRARIAN_ERROR: {
            target: 'error',
            actions: assign({
              errors: ({ context, event }) => [...context.errors, event.error],
            }),
          },
          CONTEXT_RESET_REQUIRED: 'completion',
          BUDGET_EXCEEDED: 'completion',
        },
      },
      artisan: {
        on: {
          ARTISAN_SUCCESS: {
            target: 'critic',
            actions: assign({
              artisanOutput: ({ event }) => event.output,
            }),
          },
          ARTISAN_ERROR: {
            target: 'error',
            actions: assign({
              errors: ({ context, event }) => [...context.errors, event.error],
            }),
          },
          CONTEXT_RESET_REQUIRED: 'completion',
          BUDGET_EXCEEDED: 'completion',
        },
      },
      critic: {
        on: {
          CRITIC_SUCCESS: {
            target: 'testing',
            actions: assign({
              criticOutput: ({ event }) => event.output,
            }),
          },
          CRITIC_ERROR: {
            target: 'error',
            actions: assign({
              errors: ({ context, event }) => [...context.errors, event.error],
            }),
          },
          CONTEXT_RESET_REQUIRED: 'completion',
          BUDGET_EXCEEDED: 'completion',
        },
      },
      testing: {
        on: {
          TESTS_PASS: {
            target: 'adversarial',
            actions: assign({
              testResults: ({ event }) => event.results,
            }),
          },
          TESTS_FAIL: {
            target: 'completion',
            actions: assign({
              testResults: ({ event }) => event.results,
            }),
          },
          BUDGET_EXCEEDED: 'completion',
          ENTROPY_DETECTED: 'completion',
        },
      },
      adversarial: {
        on: {
          ADVERSARIAL_SUCCESS: {
            target: 'completion',
            actions: assign({
              adversarialResults: ({ event }) => event.results,
            }),
          },
          ADVERSARIAL_FAIL: {
            target: 'completion',
            actions: assign({
              adversarialResults: ({ event }) => event.results,
            }),
          },
          BUDGET_EXCEEDED: 'completion',
        },
      },
      completion: {
        type: 'final',
      },
      error: {
        type: 'final',
      },
    },
  },
  {
    actions: {},
    guards: {},
  }
);

/**
 * Create Ralph machine with initial context
 */
export function createRalphMachine(sessionId: string, iteration: number, targetFile: string) {
  return ralphMachine.provide({
    context: {
      sessionId,
      iteration,
      targetFile,
      codebaseFiles: new Map(),
      testResults: null,
      librarianOutput: null,
      artisanOutput: null,
      criticOutput: null,
      adversarialResults: null,
      errors: [],
      contextUsage: new Map(),
    },
  });
}
