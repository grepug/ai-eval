# ai-eval

AI SDK-first agent evaluation framework for `ToolLoopAgent` behavior.

`ai-eval` runs scripted scenarios against Vercel AI SDK agents, preserves
step-level traces, evaluates deterministic expectations, and writes durable
artifacts for local debugging, CI, and pull request review.

## Install

```bash
pnpm add ai-eval ai
```

`ai` is a peer dependency because the framework evaluates the consuming
project's AI SDK agents directly.

## CLI

```bash
agent-eval run \
  --config ./agent-eval.config.ts \
  --scenarios ./evals/scenarios \
  --output-dir ./eval-runs/current
```

Useful commands:

```bash
agent-eval compare \
  --baseline ./eval-runs/main/audit.json \
  --candidate ./eval-runs/current/audit.json

agent-eval review --audit ./eval-runs/current/audit.json
```

## Examples

Run the credential-free mocked example:

```bash
pnpm example:mock
```

Run the live OpenAI smoke example:

```bash
OPENAI_API_KEY=sk-... pnpm example:live
```

The live example uses `gpt-5.4-mini` by default because it is a lower-latency,
lower-cost current OpenAI model. Override it when needed:

```bash
OPENAI_API_KEY=sk-... AI_EVAL_LIVE_MODEL=gpt-5.5 pnpm example:live
```

The live example calls a real OpenAI model but uses a deterministic local
`weather` tool, so it verifies model tool use without depending on an external
weather API.

## Config

```ts
import { defineAgentEvalConfig } from 'ai-eval';
import { createWeatherAgent } from './src/weather-agent';

export default defineAgentEvalConfig({
  agents: [
    {
      key: 'weather-agent',
      name: 'Weather Agent',
      createAgent: () => createWeatherAgent(),
    },
  ],
  evaluators: [
    'tool-usage',
    'latency',
    'token-budget',
    'step-count',
    'finish-reason',
    'schema',
  ],
});
```

## Scenario

```json
{
  "id": "weather-tool-required",
  "title": "Weather tool is used for live weather",
  "kind": "tool_loop",
  "turns": [
    {
      "user": "What is the weather in Tokyo today?"
    }
  ],
  "expectations": [
    {
      "id": "uses-weather-tool",
      "evaluator": "tool-usage",
      "severity": "blocker",
      "config": {
        "requiredToolCalls": ["weather"]
      }
    }
  ]
}
```

## Artifacts

Every run writes:

- `audit.json`: canonical machine-readable output
- `review.md`: human-readable review
- `summary.json`: CI-friendly summary
- `traces/`: per-scenario, per-turn evidence
- `debug/`: debug-only provider/raw data when enabled

Eval artifacts can contain prompts, tool inputs, tool outputs, and provider
payloads. Keep `eval-runs/` out of source control unless the contents are
reviewed and safe to publish.
