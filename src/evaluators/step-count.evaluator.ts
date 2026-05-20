import { configRecord, createFailed, createPassed, evidencePathForTrace, numberValue } from './helpers.js';
import type { Evaluator } from '../core/types.js';

export const stepCountEvaluator: Evaluator = {
  key: 'step-count',
  evaluate(input) {
    const config = configRecord(input.expectation.config);
    const stepCount = input.traces.reduce((total, trace) => total + trace.diagnostics.stepCount, 0);
    const minSteps = numberValue(config.minSteps);
    const maxSteps = numberValue(config.maxSteps);
    const failures: string[] = [];

    if (minSteps !== undefined && stepCount < minSteps) {
      failures.push(`Expected at least ${minSteps} steps but saw ${stepCount}.`);
    }
    if (maxSteps !== undefined && stepCount > maxSteps) {
      failures.push(`Expected at most ${maxSteps} steps but saw ${stepCount}.`);
    }

    return failures.length === 0
      ? createPassed(input.expectation, { stepCount })
      : createFailed(input.expectation, 'Step count expectation failed', failures.join(' '), evidencePathForTrace(input.traces[0]), 'Review stopWhen configuration and whether required tool calls force extra loop steps.', { stepCount });
  },
};
