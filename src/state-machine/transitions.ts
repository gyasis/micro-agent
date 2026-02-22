/**
 * State Machine Transition Logic
 *
 * Handles state transitions and actions during Ralph Loop execution.
 * Integrates with agents, test runners, and lifecycle managers.
 *
 * @module state-machine/transitions
 */

import type { RalphContext, RalphEvent } from './ralph-machine';

export interface TransitionResult {
  nextState: string;
  context: Partial<RalphContext>;
  actions?: string[];
}

/**
 * Determine next state based on current state and event
 */
export function determineNextState(
  currentState: string,
  event: RalphEvent,
  context: RalphContext,
): TransitionResult | null {
  switch (currentState) {
    case 'librarian':
      if (event.type === 'LIBRARIAN_SUCCESS') {
        return {
          nextState: 'artisan',
          context: { librarianOutput: event.output },
          actions: ['trackLibrarianTokens'],
        };
      }
      if (event.type === 'LIBRARIAN_ERROR') {
        return {
          nextState: 'error',
          context: { errors: [...context.errors, event.error] },
        };
      }
      break;

    case 'artisan':
      if (event.type === 'ARTISAN_SUCCESS') {
        return {
          nextState: 'critic',
          context: { artisanOutput: event.output },
          actions: ['trackArtisanTokens', 'persistCodeChanges'],
        };
      }
      if (event.type === 'ARTISAN_ERROR') {
        return {
          nextState: 'error',
          context: { errors: [...context.errors, event.error] },
        };
      }
      break;

    case 'critic':
      if (event.type === 'CRITIC_SUCCESS') {
        return {
          nextState: 'testing',
          context: { criticOutput: event.output },
          actions: ['trackCriticTokens'],
        };
      }
      if (event.type === 'CRITIC_ERROR') {
        return {
          nextState: 'error',
          context: { errors: [...context.errors, event.error] },
        };
      }
      break;

    case 'testing':
      if (event.type === 'TESTS_PASS') {
        return {
          nextState: 'adversarial',
          context: { testResults: event.results },
          actions: ['persistTestResults', 'resetEntropy'],
        };
      }
      if (event.type === 'TESTS_FAIL') {
        return {
          nextState: 'completion',
          context: { testResults: event.results },
          actions: ['persistTestResults', 'trackError'],
        };
      }
      if (event.type === 'ENTROPY_DETECTED') {
        return {
          nextState: 'completion',
          context: {},
          actions: ['notifyEntropyDetected'],
        };
      }
      break;

    case 'adversarial':
      if (event.type === 'ADVERSARIAL_SUCCESS') {
        return {
          nextState: 'completion',
          context: { adversarialResults: event.results },
          actions: ['persistAdversarialResults'],
        };
      }
      if (event.type === 'ADVERSARIAL_FAIL') {
        // Intelligent backtracking: Adversarial failures are informational
        // They don't invalidate the working code that passed unit tests
        // Store the failures for analysis but proceed to completion
        return {
          nextState: 'completion',
          context: { adversarialResults: event.results },
          actions: ['persistAdversarialResults', 'notifyAdversarialFailure'],
        };
      }
      break;
  }

  // Handle global events (applicable in any state)
  if (event.type === 'BUDGET_EXCEEDED') {
    return {
      nextState: 'completion',
      context: {},
      actions: ['notifyBudgetExceeded'],
    };
  }

  if (event.type === 'CONTEXT_RESET_REQUIRED') {
    return {
      nextState: 'completion',
      context: {},
      actions: ['notifyContextResetRequired'],
    };
  }

  return null;
}

/**
 * Execute transition actions
 */
export async function executeTransitionActions(
  actions: string[],
  context: RalphContext,
  event: RalphEvent,
): Promise<void> {
  for (const action of actions) {
    try {
      await executeAction(action, context, event);
    } catch (error) {
      console.error(`Failed to execute action "${action}":`, error);
    }
  }
}

/**
 * Execute individual action
 */
async function executeAction(
  action: string,
  context: RalphContext,
  event: RalphEvent,
): Promise<void> {
  switch (action) {
    case 'trackLibrarianTokens':
      // Implemented by context monitor
      break;

    case 'trackArtisanTokens':
      // Implemented by context monitor
      break;

    case 'trackCriticTokens':
      // Implemented by context monitor
      break;

    case 'persistCodeChanges':
      // Implemented by state persister
      break;

    case 'persistTestResults':
      // Implemented by state persister
      break;

    case 'persistAdversarialResults':
      // Implemented by state persister
      break;

    case 'resetEntropy':
      // Implemented by iteration manager
      break;

    case 'trackError':
      // Implemented by iteration manager
      break;

    case 'notifyEntropyDetected':
      console.warn('⚠️  Entropy detected - circuit breaker triggered');
      break;

    case 'notifyBudgetExceeded':
      console.warn('⚠️  Budget exceeded - stopping iteration');
      break;

    case 'notifyContextResetRequired':
      console.warn('⚠️  Context reset required - 40% threshold exceeded');
      break;

    case 'notifyAdversarialFailure':
      console.info(
        'ℹ️  Adversarial tests revealed potential improvements (unit tests still pass)',
      );
      break;

    default:
      console.warn(`Unknown action: ${action}`);
  }
}

/**
 * Validate transition is allowed
 */
export function isTransitionValid(
  fromState: string,
  toState: string,
  context: RalphContext,
): boolean {
  // Define allowed transitions
  const validTransitions: Record<string, string[]> = {
    librarian: ['artisan', 'error', 'completion'],
    artisan: ['critic', 'error', 'completion'],
    critic: ['testing', 'error', 'completion'],
    testing: ['adversarial', 'completion', 'error'],
    adversarial: ['completion', 'error'],
    completion: [],
    error: [],
  };

  const allowed = validTransitions[fromState] || [];
  return allowed.includes(toState);
}
