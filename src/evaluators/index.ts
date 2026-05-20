import { finishReasonEvaluator } from './finish-reason.evaluator.js';
import { humanReviewEvaluator } from './human-review.evaluator.js';
import { latencyEvaluator } from './latency.evaluator.js';
import { llmJudgeEvaluator } from './llm-judge.evaluator.js';
import { schemaEvaluator } from './schema.evaluator.js';
import { stepCountEvaluator } from './step-count.evaluator.js';
import { textContainsEvaluator } from './text-contains.evaluator.js';
import { tokenBudgetEvaluator } from './token-budget.evaluator.js';
import { toolUsageEvaluator } from './tool-usage.evaluator.js';
import type { Evaluator } from '../core/types.js';

export const builtInEvaluators: Record<string, Evaluator> = {
  [finishReasonEvaluator.key]: finishReasonEvaluator,
  [humanReviewEvaluator.key]: humanReviewEvaluator,
  [latencyEvaluator.key]: latencyEvaluator,
  [llmJudgeEvaluator.key]: llmJudgeEvaluator,
  [schemaEvaluator.key]: schemaEvaluator,
  [stepCountEvaluator.key]: stepCountEvaluator,
  [textContainsEvaluator.key]: textContainsEvaluator,
  [tokenBudgetEvaluator.key]: tokenBudgetEvaluator,
  [toolUsageEvaluator.key]: toolUsageEvaluator,
};

export {
  finishReasonEvaluator,
  humanReviewEvaluator,
  latencyEvaluator,
  llmJudgeEvaluator,
  schemaEvaluator,
  stepCountEvaluator,
  textContainsEvaluator,
  tokenBudgetEvaluator,
  toolUsageEvaluator,
};
