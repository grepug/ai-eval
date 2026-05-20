import { describe, expect, it } from 'vitest';
import { normalizeAiSdkResult } from '../src/ai-sdk/trace-normalizer.js';

describe('normalizeAiSdkResult', () => {
  it('preserves AI SDK step, tool, usage, and output details', () => {
    const trace = normalizeAiSdkResult({
      runId: 'run-1',
      scenarioId: 'weather-tool-required',
      agentKey: 'weather-agent',
      turnIndex: 0,
      messages: [{ role: 'user', content: 'Weather?' }],
      startedAt: new Date('2026-05-20T00:00:00.000Z'),
      completedAt: new Date('2026-05-20T00:00:02.000Z'),
      result: {
        text: 'Tokyo is cloudy.',
        output: { city: 'Tokyo' },
        finishReason: 'stop',
        totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        response: { messages: [{ role: 'assistant', content: 'Tokyo is cloudy.' }] },
        steps: [
          {
            text: 'Using weather tool.',
            finishReason: 'tool-calls',
            toolCalls: [{ toolCallId: 'call-1', toolName: 'weather', input: { city: 'Tokyo' } }],
            toolResults: [{ toolCallId: 'call-1', toolName: 'weather', output: { condition: 'cloudy' } }],
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        ],
      },
    });

    expect(trace.status).toBe('completed');
    expect(trace.output.text).toBe('Tokyo is cloudy.');
    expect(trace.output.structured).toEqual({ city: 'Tokyo' });
    expect(trace.steps[0]?.toolCalls[0]?.toolName).toBe('weather');
    expect(trace.diagnostics.toolResultCount).toBe(1);
    expect(trace.usage.totalTokens).toBe(15);
    expect(trace.timing.durationMs).toBe(2000);
  });
});
