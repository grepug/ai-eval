import { defineAgentEvalConfig } from '../../src/index.js';

const mockWeatherAgent = {
  async generate() {
    return {
      text: 'Tokyo is cloudy and 72F.',
      output: { city: 'Tokyo', condition: 'cloudy', temperatureF: 72 },
      finishReason: 'stop',
      totalUsage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
      },
      response: {
        messages: [{ role: 'assistant', content: 'Tokyo is cloudy and 72F.' }],
      },
      steps: [
        {
          text: 'Tokyo is cloudy and 72F.',
          finishReason: 'stop',
          toolCalls: [
            {
              toolCallId: 'call-weather',
              toolName: 'weather',
              input: { city: 'Tokyo' },
            },
          ],
          toolResults: [
            {
              toolCallId: 'call-weather',
              toolName: 'weather',
              output: { city: 'Tokyo', condition: 'cloudy', temperatureF: 72 },
            },
          ],
          usage: {
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
          },
        },
      ],
    };
  },
};

export default defineAgentEvalConfig({
  agents: [
    {
      key: 'weather-agent',
      name: 'Weather Agent',
      createAgent: () => mockWeatherAgent,
    },
  ],
  evaluators: ['tool-usage', 'latency'],
});
