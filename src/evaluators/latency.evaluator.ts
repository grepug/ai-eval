import { configRecord, createFailed, createPassed, evidencePathForTrace, numberValue } from './helpers.js';
import type { Evaluator } from '../core/types.js';

export const latencyEvaluator: Evaluator = {
  key: 'latency',
  evaluate(input) {
    const config = configRecord(input.expectation.config);
    const maxRunMs = numberValue(config.maxRunMs);
    const maxTurnMs = numberValue(config.maxTurnMs);
    const maxFirstTokenMs = numberValue(config.maxFirstTokenMs);
    const totalMs = input.traces.reduce((total, trace) => total + trace.timing.durationMs, 0);
    const maxObservedTurnMs = Math.max(0, ...input.traces.map((trace) => trace.timing.durationMs));
    const firstTokenValues = input.traces
      .map((trace) => trace.timing.firstTokenMs)
      .filter((value): value is number => typeof value === 'number');
    const maxObservedFirstTokenMs = firstTokenValues.length ? Math.max(...firstTokenValues) : null;
    const failures: string[] = [];

    if (maxRunMs !== undefined && totalMs > maxRunMs) {
      failures.push(`Expected run latency <= ${maxRunMs}ms but saw ${totalMs}ms.`);
    }
    if (maxTurnMs !== undefined && maxObservedTurnMs > maxTurnMs) {
      failures.push(`Expected turn latency <= ${maxTurnMs}ms but saw ${maxObservedTurnMs}ms.`);
    }
    if (maxFirstTokenMs !== undefined && maxObservedFirstTokenMs !== null && maxObservedFirstTokenMs > maxFirstTokenMs) {
      failures.push(`Expected first token latency <= ${maxFirstTokenMs}ms but saw ${maxObservedFirstTokenMs}ms.`);
    }

    const metrics = { totalMs, maxTurnMs: maxObservedTurnMs, maxFirstTokenMs: maxObservedFirstTokenMs };
    return failures.length === 0
      ? createPassed(input.expectation, metrics)
      : createFailed(input.expectation, 'Latency expectation failed', failures.join(' '), evidencePathForTrace(input.traces[0]), 'Compare model, tool, and network latency against the baseline run.', metrics);
  },
};
