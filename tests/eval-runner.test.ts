import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runAgentEval } from '../src/core/eval-runner.js';
import type { EvalScenario } from '../src/core/types.js';

const scenario: EvalScenario = {
  id: 'weather-tool-required',
  title: 'Weather tool is used',
  kind: 'tool_loop',
  turns: [{ user: 'Weather in Tokyo?' }],
  expectations: [
    {
      id: 'uses-weather',
      evaluator: 'tool-usage',
      severity: 'blocker',
      config: { requiredToolCalls: ['weather'] },
    },
  ],
};

describe('runAgentEval', () => {
  it('runs a mocked agent and writes audit, review, summary, and trace artifacts', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'ai-eval-test-'));

    try {
      const result = await runAgentEval({
        outputDir,
        scenarios: [scenario],
        agents: [
          {
            key: 'weather-agent',
            name: 'Weather Agent',
            createAgent: () => ({
              async generate() {
                return {
                  text: 'Tokyo is cloudy.',
                  finishReason: 'stop',
                  totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                  response: { messages: [{ role: 'assistant', content: 'Tokyo is cloudy.' }] },
                  steps: [
                    {
                      toolCalls: [{ toolCallId: 'call-1', toolName: 'weather', input: { city: 'Tokyo' } }],
                      toolResults: [{ toolCallId: 'call-1', toolName: 'weather', output: { condition: 'cloudy' } }],
                    },
                  ],
                };
              },
            }),
          },
        ],
      });

      expect(result.audit.evalRun.decision).toBe('passed');
      expect(JSON.parse(await readFile(join(outputDir, 'summary.json'), 'utf8')).decision).toBe('passed');
      expect(await readFile(join(outputDir, 'review.md'), 'utf8')).toContain('Decision: Passed');
      expect(await readFile(join(outputDir, 'traces/weather-tool-required/weather-agent.turn-1.json'), 'utf8')).toContain('weather');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('keeps finding ids and trace paths distinct for reused expectation ids', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'ai-eval-test-'));
    const scenarios: EvalScenario[] = [
      {
        id: 'Weather Scenario One',
        title: 'First weather scenario',
        kind: 'tool_loop',
        turns: [{ user: 'Weather in Tokyo?' }],
        expectations: [
          {
            id: 'uses-weather',
            evaluator: 'tool-usage',
            severity: 'blocker',
            config: { requiredToolCalls: ['weather'] },
          },
        ],
      },
      {
        id: 'Weather Scenario Two',
        title: 'Second weather scenario',
        kind: 'tool_loop',
        turns: [{ user: 'Weather in Paris?' }],
        expectations: [
          {
            id: 'uses-weather',
            evaluator: 'tool-usage',
            severity: 'blocker',
            config: { requiredToolCalls: ['weather'] },
          },
        ],
      },
    ];

    try {
      const result = await runAgentEval({
        outputDir,
        scenarios,
        agents: [
          {
            key: 'Weather Agent',
            name: 'Weather Agent',
            createAgent: () => ({
              async generate() {
                return {
                  text: 'No tool used.',
                  finishReason: 'stop',
                  totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                  response: { messages: [{ role: 'assistant', content: 'No tool used.' }] },
                  steps: [{ toolCalls: [], toolResults: [] }],
                };
              },
            }),
          },
        ],
      });

      expect(result.audit.findingOrder).toHaveLength(2);
      expect(new Set(result.audit.findingOrder).size).toBe(2);
      expect(Object.keys(result.audit.findings)).toHaveLength(2);
      expect(result.audit.scenarios['Weather Scenario One']?.agentResults['Weather Agent']?.tracePaths).toEqual([
        'traces/weather-scenario-one/weather-agent.turn-1.json',
      ]);
      expect(Object.values(result.audit.findings)[0]?.evidencePath).toBe('traces/weather-scenario-one/weather-agent.turn-1.json');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
