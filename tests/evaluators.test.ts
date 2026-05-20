import { describe, expect, it } from 'vitest';
import { toolUsageEvaluator } from '../src/evaluators/tool-usage.evaluator.js';
import { tokenBudgetEvaluator } from '../src/evaluators/token-budget.evaluator.js';
import type { AiSdkEvalTrace, EvalExpectation, EvalScenario } from '../src/core/types.js';

const scenario: EvalScenario = {
  id: 'weather-tool-required',
  title: 'Weather tool is used',
  kind: 'tool_loop',
  turns: [{ user: 'Weather?' }],
  expectations: [],
};

const trace: AiSdkEvalTrace = {
  schemaVersion: 'ai-sdk-eval-trace.v1',
  traceId: 'trace-1',
  runId: 'run-1',
  scenarioId: scenario.id,
  agentKey: 'weather-agent',
  turnIndex: 0,
  startedAt: '2026-05-20T00:00:00.000Z',
  completedAt: '2026-05-20T00:00:01.000Z',
  status: 'completed',
  input: { turnsCompletedBeforeRun: 0, messages: [] },
  output: { text: 'Tokyo is cloudy.', finishReason: 'stop' },
  steps: [
    {
      index: 0,
      toolCalls: [{ toolCallId: 'call-1', toolName: 'weather', input: { city: 'Tokyo' } }],
      toolResults: [],
    },
  ],
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  timing: { durationMs: 1000 },
  diagnostics: { timeout: false, stepCount: 1, toolCallCount: 1, toolResultCount: 0 },
};

describe('built-in evaluators', () => {
  it('passes required tool usage', async () => {
    const expectation: EvalExpectation = {
      id: 'uses-weather',
      evaluator: 'tool-usage',
      severity: 'blocker',
      config: { requiredToolCalls: ['weather'] },
    };

    const result = await toolUsageEvaluator.evaluate({ scenario, agentKey: 'weather-agent', traces: [trace], expectation });

    expect(result.status).toBe('passed');
    expect(result.findings).toHaveLength(0);
  });

  it('fails missing required tool usage', async () => {
    const expectation: EvalExpectation = {
      id: 'uses-search',
      evaluator: 'tool-usage',
      severity: 'blocker',
      config: { requiredToolCalls: ['search'] },
    };

    const result = await toolUsageEvaluator.evaluate({ scenario, agentKey: 'weather-agent', traces: [trace], expectation });

    expect(result.status).toBe('failed');
    expect(result.findings[0]?.severity).toBe('blocker');
  });

  it('fails token budget overages', async () => {
    const expectation: EvalExpectation = {
      id: 'token-budget',
      evaluator: 'token-budget',
      severity: 'major',
      config: { maxTotalTokens: 10 },
    };

    const result = await tokenBudgetEvaluator.evaluate({ scenario, agentKey: 'weather-agent', traces: [trace], expectation });

    expect(result.status).toBe('failed');
    expect(result.metrics?.totalTokens).toBe(15);
  });
});
