import { configRecord } from './helpers.js';
import type { Evaluator } from '../core/types.js';

export const humanReviewEvaluator: Evaluator = {
  key: 'human-review',
  evaluate(input) {
    const config = configRecord(input.expectation.config);
    const prompt = typeof config.prompt === 'string' ? config.prompt : 'Human review requested.';
    return {
      expectationId: input.expectation.id,
      status: 'needs_review',
      findings: [
        {
          id: `${input.expectation.id}-needs-review`,
          severity: input.expectation.severity,
          title: 'Human review required',
          details: prompt,
          evidencePath: Array.isArray(config.evidencePaths) ? config.evidencePaths.join(', ') : 'audit.json',
          recommendation: 'Review the linked traces and record the decision outside the automated evaluator.',
        },
      ],
    };
  },
};
