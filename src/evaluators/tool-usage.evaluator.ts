import { allToolNames, configRecord, createFailed, createPassed, evidencePathForTrace, numberValue, stringArray } from './helpers.js';
import type { Evaluator } from '../core/types.js';

export const toolUsageEvaluator: Evaluator = {
  key: 'tool-usage',
  evaluate(input) {
    const config = configRecord(input.expectation.config);
    const toolNames = allToolNames(input.traces);
    const required = stringArray(config.requiredToolCalls);
    const forbidden = stringArray(config.forbiddenToolCalls);
    const requiredOrder = stringArray(config.requiredOrder);
    const maxToolCallCount = numberValue(config.maxToolCallCount);
    const failures: string[] = [];

    const missing = required.filter((toolName) => !toolNames.includes(toolName));
    if (missing.length > 0) {
      failures.push(`Missing required tool calls: ${missing.join(', ')}.`);
    }

    const forbiddenUsed = forbidden.filter((toolName) => toolNames.includes(toolName));
    if (forbiddenUsed.length > 0) {
      failures.push(`Forbidden tool calls were used: ${forbiddenUsed.join(', ')}.`);
    }

    if (maxToolCallCount !== undefined && toolNames.length > maxToolCallCount) {
      failures.push(`Expected at most ${maxToolCallCount} tool calls but saw ${toolNames.length}.`);
    }

    if (requiredOrder.length > 0 && !isOrderedSubsequence(requiredOrder, toolNames)) {
      failures.push(`Expected tool order ${requiredOrder.join(' -> ')} but saw ${toolNames.join(' -> ') || 'no tool calls'}.`);
    }

    if (failures.length === 0) {
      return createPassed(input.expectation, { toolCallCount: toolNames.length });
    }

    return createFailed(
      input.expectation,
      'Tool usage expectation failed',
      failures.join(' '),
      evidencePathForTrace(input.traces[0]),
      'Review the agent instructions, tool descriptions, and stop conditions for this scenario.',
      { toolCallCount: toolNames.length },
    );
  },
};

function isOrderedSubsequence(expected: string[], actual: string[]): boolean {
  let offset = 0;
  for (const toolName of actual) {
    if (toolName === expected[offset]) {
      offset += 1;
    }
    if (offset === expected.length) {
      return true;
    }
  }
  return expected.length === 0;
}
