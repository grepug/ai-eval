import type { Evaluator } from '../core/types.js';

export const llmJudgeEvaluator: Evaluator = {
  key: 'llm-judge',
  evaluate(input) {
    return {
      expectationId: input.expectation.id,
      status: 'needs_review',
      findings: [
        {
          id: `${input.expectation.id}-llm-judge-not-configured`,
          severity: input.expectation.severity,
          title: 'LLM judge evaluator requires a project judge implementation',
          details: 'The built-in framework keeps LLM judging optional. Register a custom evaluator with key "llm-judge" to call a judge model.',
          evidencePath: 'audit.json',
          recommendation: 'Use deterministic evaluators for release-blocking contracts and wire a project-specific judge for qualitative review.',
        },
      ],
    };
  },
};
