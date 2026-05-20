import { configRecord, createFailed, createPassed, evidencePathForTrace, numberValue } from './helpers.js';
import type { Evaluator } from '../core/types.js';

export const tokenBudgetEvaluator: Evaluator = {
  key: 'token-budget',
  evaluate(input) {
    const config = configRecord(input.expectation.config);
    const usage = input.traces.reduce(
      (total, trace) => ({
        inputTokens: total.inputTokens + trace.usage.inputTokens,
        outputTokens: total.outputTokens + trace.usage.outputTokens,
        totalTokens: total.totalTokens + trace.usage.totalTokens,
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    );
    const failures: string[] = [];

    for (const [configKey, usageKey] of [
      ['maxInputTokens', 'inputTokens'],
      ['maxOutputTokens', 'outputTokens'],
      ['maxTotalTokens', 'totalTokens'],
    ] as const) {
      const limit = numberValue(config[configKey]);
      if (limit !== undefined && usage[usageKey] > limit) {
        failures.push(`Expected ${usageKey} <= ${limit} but saw ${usage[usageKey]}.`);
      }
    }

    return failures.length === 0
      ? createPassed(input.expectation, usage)
      : createFailed(input.expectation, 'Token budget expectation failed', failures.join(' '), evidencePathForTrace(input.traces[0]), 'Inspect prompt/context growth, tool output size, and multi-turn history behavior.', usage);
  },
};
