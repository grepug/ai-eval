import { configRecord, createFailed, createPassed, evidencePathForTrace } from './helpers.js';
import type { Evaluator } from '../core/types.js';
import { z } from 'zod';

export const schemaEvaluator: Evaluator = {
  key: 'schema',
  evaluate(input) {
    const config = configRecord(input.expectation.config);
    const schemaKey = typeof config.schemaKey === 'string' ? config.schemaKey : undefined;
    const requireStructuredOutput = config.requireStructuredOutput !== false;
    const schema = schemaKey ? input.schemas?.[schemaKey] : undefined;
    const latestTrace = input.traces.at(-1);
    const structured = latestTrace?.output.structured;

    if (!schemaKey || !schema) {
      return createFailed(
        input.expectation,
        'Schema expectation is not configured',
        `No schema was registered for schemaKey "${schemaKey ?? 'undefined'}".`,
        evidencePathForTrace(latestTrace),
        'Register the schema in defineAgentEvalConfig({ schemas }) and reference it by schemaKey.',
      );
    }

    if (structured === undefined && requireStructuredOutput) {
      return createFailed(
        input.expectation,
        'Structured output is missing',
        'The trace did not include structured output.',
        evidencePathForTrace(latestTrace),
        'Ensure the agent uses AI SDK structured output for this scenario.',
      );
    }

    const parsed = schema.safeParse(structured);
    return parsed.success
      ? createPassed(input.expectation)
      : createFailed(input.expectation, 'Structured output schema failed', z.prettifyError(parsed.error), evidencePathForTrace(latestTrace), 'Update the agent output contract or the scenario expectation.');
  },
};
