import { allText, configRecord, createFailed, createPassed, evidencePathForTrace, stringArray } from './helpers.js';
import type { Evaluator } from '../core/types.js';

export const textContainsEvaluator: Evaluator = {
  key: 'text-contains',
  evaluate(input) {
    const config = configRecord(input.expectation.config);
    const caseSensitive = config.caseSensitive === true;
    const text = caseSensitive ? allText(input.traces) : allText(input.traces).toLowerCase();
    const required = normalize(stringArray(config.required), caseSensitive);
    const forbidden = normalize(stringArray(config.forbidden), caseSensitive);
    const missing = required.filter((item) => !text.includes(item));
    const presentForbidden = forbidden.filter((item) => text.includes(item));
    const failures: string[] = [];

    if (missing.length > 0) {
      failures.push(`Missing required text: ${missing.join(', ')}.`);
    }
    if (presentForbidden.length > 0) {
      failures.push(`Forbidden text was present: ${presentForbidden.join(', ')}.`);
    }

    return failures.length === 0
      ? createPassed(input.expectation)
      : createFailed(input.expectation, 'Text expectation failed', failures.join(' '), evidencePathForTrace(input.traces[0]), 'Prefer structured-output expectations for release-blocking product contracts.');
  },
};

function normalize(values: string[], caseSensitive: boolean): string[] {
  return caseSensitive ? values : values.map((value) => value.toLowerCase());
}
