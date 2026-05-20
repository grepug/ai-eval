import { openai } from '@ai-sdk/openai';
import { stepCountIs, ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
import { defineAgentEvalConfig } from '../../src/index.js';

const model = process.env.AI_EVAL_LIVE_MODEL ?? 'gpt-5.4-mini';

export default defineAgentEvalConfig({
  agents: [
    {
      key: 'live-weather-agent',
      name: 'Live Weather Agent',
      createAgent: () => {
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY is required to run the live weather agent example.');
        }

        return new ToolLoopAgent({
          model: openai(model),
          instructions: [
            'You are a concise weather assistant.',
            'Always use the weather tool before answering weather questions.',
            'Use the tool result as the source of truth.',
          ].join(' '),
          toolChoice: { type: 'tool', toolName: 'weather' },
          stopWhen: stepCountIs(4),
          maxOutputTokens: 220,
          tools: {
            weather: tool({
              description: 'Get deterministic current weather for a city used by the live eval smoke test.',
              inputSchema: z.object({
                city: z.string().describe('City name to look up.'),
              }),
              execute: async ({ city }) => ({
                city,
                condition: 'cloudy',
                temperatureF: 72,
                observedAt: '2026-05-20T10:00:00.000Z',
                source: 'local deterministic smoke-test fixture',
              }),
            }),
          },
        });
      },
    },
  ],
  evaluators: [
    'tool-usage',
    'latency',
    'token-budget',
    'step-count',
    'finish-reason',
    'text-contains',
  ],
});
