import { configRecord, createFailed, createPassed, evidencePathForTrace, stringArray } from './helpers.js';
import type { Evaluator } from '../core/types.js';

export const finishReasonEvaluator: Evaluator = {
  key: 'finish-reason',
  evaluate(input) {
    const allowed = stringArray(configRecord(input.expectation.config).allowedFinishReasons);
    const finishReasons = input.traces.map((trace) => trace.output.finishReason ?? 'unknown');
    const invalid = allowed.length === 0 ? [] : finishReasons.filter((reason) => !allowed.includes(reason));

    return invalid.length === 0
      ? createPassed(input.expectation, { finishReasons: finishReasons.join(', ') })
      : createFailed(
          input.expectation,
          'Finish reason expectation failed',
          `Expected finish reason to be one of ${allowed.join(', ')} but saw ${invalid.join(', ')}.`,
          evidencePathForTrace(input.traces[0]),
          'Check model stop conditions, max token limits, and tool loop termination behavior.',
          { finishReasons: finishReasons.join(', ') },
        );
  },
};
