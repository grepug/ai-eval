import { openai } from '@ai-sdk/openai';
import { stepCountIs, ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
import { defineAgentEvalConfig } from '../../src/index.js';

const model = process.env.AI_EVAL_LIVE_MODEL ?? 'gpt-5.4-mini';
const forcedToolOrder = ['profile', 'weather', 'searchAttractions', 'estimateBudget'] as const;

export default defineAgentEvalConfig({
  agents: [
    {
      key: 'live-trip-planner-agent',
      name: 'Live Trip Planner Agent',
      createAgent: () => {
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY is required to run the live trip planner example.');
        }

        return new ToolLoopAgent({
          model: openai.chat(model),
          instructions: [
            'You are a concise travel concierge.',
            'Use the available tools before producing itinerary advice.',
            'Remember user preferences across turns.',
            'The final answer must mention Tokyo, $500, museum, quiet, and avoid nightlife.',
            'Keep the final plan compact: two days, bullets preferred.',
          ].join(' '),
          stopWhen: stepCountIs(6),
          prepareStep: ({ stepNumber }) => {
            const toolName = forcedToolOrder[stepNumber];
            return {
              toolChoice: toolName ? { type: 'tool', toolName } : 'auto',
            };
          },
          maxOutputTokens: 360,
          tools: {
            profile: tool({
              description: 'Load saved user travel preferences.',
              inputSchema: z.object({}),
              execute: async () => ({
                travelerType: 'couple',
                foodPreference: 'vegetarian-friendly quiet restaurants',
                likes: ['museums', 'gardens', 'walkable neighborhoods'],
                avoids: ['nightlife', 'loud bars', 'crowded clubs'],
              }),
            }),
            weather: tool({
              description: 'Get deterministic weather for a destination and date window.',
              inputSchema: z.object({
                city: z.string(),
                dateWindow: z.string(),
              }),
              execute: async ({ city, dateWindow }) => ({
                city,
                dateWindow,
                forecast: [
                  { day: 'day 1', condition: 'light rain', temperatureF: 68 },
                  { day: 'day 2', condition: 'clear', temperatureF: 73 },
                ],
                recommendation: 'put indoor museums on rainy day 1 and gardens on clear day 2',
              }),
            }),
            searchAttractions: tool({
              description: 'Find deterministic attraction candidates for the trip plan.',
              inputSchema: z.object({
                city: z.string(),
                interests: z.array(z.string()),
              }),
              execute: async ({ city }) => ({
                city,
                attractions: [
                  { name: 'Tokyo National Museum', type: 'museum', estimatedCostUsd: 8, dayFit: 'rainy day' },
                  { name: 'Nezu Museum', type: 'museum and garden', estimatedCostUsd: 12, dayFit: 'clear day' },
                  { name: 'Yanaka Ginza', type: 'quiet neighborhood walk', estimatedCostUsd: 0, dayFit: 'clear day' },
                  { name: 'Daikanyama T-Site', type: 'quiet cafe and bookstore area', estimatedCostUsd: 20, dayFit: 'rainy day' },
                ],
              }),
            }),
            estimateBudget: tool({
              description: 'Estimate deterministic trip cost for a compact itinerary.',
              inputSchema: z.object({
                city: z.string(),
                days: z.number(),
                maxBudgetUsd: z.number(),
              }),
              execute: async ({ city, days, maxBudgetUsd }) => ({
                city,
                days,
                maxBudgetUsd,
                estimatedTotalUsd: 410,
                categories: {
                  attractions: 40,
                  food: 190,
                  localTransit: 60,
                  buffer: 120,
                },
                withinBudget: true,
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
