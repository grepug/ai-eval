import { builtInEvaluators } from '../evaluators/index.js';
import type { Evaluator } from './types.js';

export function resolveEvaluators(input: Array<string | Evaluator> | undefined): Record<string, Evaluator> {
  const registry: Record<string, Evaluator> = { ...builtInEvaluators };

  for (const item of input ?? []) {
    if (typeof item === 'string') {
      const builtIn = builtInEvaluators[item];
      if (!builtIn) {
        throw new Error(`Unknown built-in evaluator: ${item}`);
      }
      registry[item] = builtIn;
      continue;
    }
    registry[item.key] = item;
  }

  return registry;
}
