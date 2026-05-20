---
name: ai-eval
description: Use when helping an end user evaluate their own Vercel AI SDK agent with ai-eval through JSON scenario datasets and configuration, run mock or live evals, interpret scores/reports/traces, compare baselines, and debug failures safely.
---

# AI Eval User Guide

Use this skill to help a user evaluate **their own agent** with `ai-eval`. Treat the workflow as JSON-first, not JSON-only: users should write scenario datasets and evaluator settings in JSON, but there must be a real hook that binds `agentKey` to their AI SDK agent.

## Mental Model

Explain `ai-eval` in four parts:

- **Dataset**: JSON scenario files that describe user turns and expectations.
- **Runner**: `agent-eval run`, which executes scenarios against an AI SDK agent.
- **Scorer**: evaluators such as `tool-usage`, `latency`, `token-budget`, and `schema`.
- **Report**: `review.md`, `summary.json`, `audit.json`, and per-turn trace JSON.

Use consistent public terms: `scenario`, `turn`, `trace`, `step`, `evaluator`, `finding`, `audit`, `review`, `baseline`.

## User Setup

Prefer a JSON-first user setup:

```text
evals/
  ai-eval.config.json
  scenarios/
    smoke.json
    tool-use.json
    multi-turn.json
    regressions.json
```

The user-owned JSON config describes which registered agent and evaluators to use:

```json
{
  "agentKey": "my-agent",
  "evaluators": [
    "tool-usage",
    "latency",
    "token-budget",
    "step-count",
    "finish-reason",
    "text-contains"
  ],
  "defaults": {
    "timeoutMs": 90000,
    "outputDir": "./eval-runs/current"
  }
}
```

Push back if someone claims users only need JSON. JSON cannot instantiate arbitrary app code by itself. A usable setup needs one of these hooks:

- A product/platform-provided registry where `agentKey` is already registered.
- A one-time integration file that registers the user's agent factory.
- A hosted eval service that already knows how to resolve the user's agent.

Recommended local hook:

```ts
// agent-eval.registry.ts
import { defineAgentEvalRegistry } from 'ai-eval';
import { createMyAgent } from './src/my-agent';

export default defineAgentEvalRegistry({
  agents: {
    'my-agent': {
      name: 'My Agent',
      createAgent: () => createMyAgent(),
    },
  },
});
```

Then day-to-day eval authoring stays JSON:

```bash
agent-eval run \
  --registry ./agent-eval.registry.ts \
  --config ./evals/ai-eval.config.json \
  --scenarios ./evals/scenarios
```

If the project does not provide `--registry` or equivalent yet, call that out as a product gap. Do not pretend the JSON config alone is sufficient.

For OpenAI-compatible custom routers, recommend environment variables:

```bash
OPENAI_BASE_URL=https://your-router.example/v1
OPENAI_API_KEY=...
AI_EVAL_LIVE_MODEL=gpt-5.4-mini
```

Never print or commit real keys. Keep `.env` ignored.

## Scenario Dataset

The main user-authored artifact is a scenario JSON file. A scenario is one eval case:

```json
{
  "id": "required-tool-used",
  "title": "Agent uses the required tool",
  "kind": "tool_loop",
  "tags": ["smoke", "tools"],
  "turns": [
    { "user": "Answer this using the product lookup tool." }
  ],
  "expectations": [
    {
      "id": "uses-product-lookup",
      "evaluator": "tool-usage",
      "severity": "blocker",
      "config": {
        "requiredToolCalls": ["productLookup"],
        "maxToolCallCount": 3
      }
    }
  ]
}
```

Recommended dataset structure:

```text
evals/
  scenarios/
    smoke.json
    tool-use.json
    multi-turn.json
    regressions.json
```

Start with 5-10 scenarios. Prefer stable, deterministic expectations before adding subjective judging.

## Running Evals

Run a dataset:

```bash
agent-eval run \
  --config ./evals/ai-eval.config.json \
  --scenarios ./evals/scenarios \
  --output-dir ./eval-runs/current \
  --timeout-ms 90000
```

Run one scenario while debugging:

```bash
agent-eval run \
  --config ./evals/ai-eval.config.json \
  --scenarios ./evals/scenarios \
  --scenario-id required-tool-used \
  --output-dir /tmp/agent-eval-debug \
  --debug
```

Compare against a baseline:

```bash
agent-eval compare \
  --baseline ./eval-runs/main/audit.json \
  --candidate ./eval-runs/current/audit.json
```

## Using ai-eval in Test Suites

Using `ai-eval` inside a test file can be appropriate, but only for dedicated agent integration/e2e specs. Do not use it as a replacement for normal framework unit tests.

Recommended boundary:

```text
NestJS .spec.ts
- deterministic service/controller/guard/DTO tests
- no live model calls

NestJS .e2e-spec.ts or .eval-spec.ts
- small ai-eval smoke suite
- asserts agent contract, decision, and score
- usually gated behind an environment variable
```

Good use cases inside an eval/e2e spec:

- agent calls the expected tools
- agent preserves state across turns
- agent returns schema-valid structured output
- agent stays inside token/latency budgets
- prompt/model/tool changes do not regress a smoke dataset

Bad use cases:

- replacing service unit tests
- testing pure business logic
- testing DTO validation
- testing database/repository behavior
- running broad paid live evals on every local test command

Recommended gated pattern:

```ts
import { runAgentEval } from 'ai-eval';
import config from '../agent-eval.config';
import scenarios from '../evals/scenarios/smoke.json';

const runLiveEvals = process.env.RUN_LIVE_EVALS === '1';

(runLiveEvals ? describe : describe.skip)('agent eval smoke', () => {
  it('passes smoke eval scenarios', async () => {
    const result = await runAgentEval({
      ...config,
      scenarios,
      outputDir: '/tmp/my-agent-eval-smoke',
      timeoutMs: 90000,
      concurrency: 1,
    });

    expect(result.audit.evalRun.decision).toBe('passed');
    expect(result.audit.metrics.scorePercent).toBeGreaterThanOrEqual(90);
  }, 120_000);
});
```

Recommendation: keep the embedded spec small and stable. Put broad scenario suites in explicit eval commands or CI jobs, not in ordinary unit-test runs.

## Built-In Evaluators

- `tool-usage`: required/forbidden tools, ordered tools, max tool count.
- `text-contains`: required/forbidden final text.
- `step-count`: AI SDK loop step budget.
- `finish-reason`: expected finish reasons such as `stop`.
- `latency`: max run, turn, or first-token time.
- `token-budget`: input, output, or total token limits.
- `schema`: structured output against a registered Zod schema.
- `human-review`: marks an expectation as requiring human review.
- `llm-judge`: placeholder; users should register a project-specific judge.

Severity guidance:

- `blocker`: hard product contract, such as required tool use or schema validity.
- `major`: serious behavior regression.
- `minor`: budget, latency, or wording guardrail.
- `info`: report-only signal.

## Score and Reports

Read `review.md` first. It summarizes:

- decision
- score
- pass rate
- highest-priority findings
- scenario results
- artifact paths

`summary.json` is for CI:

```json
{
  "decision": "passed",
  "score": 1,
  "scorePercent": 100,
  "passRate": 1
}
```

`audit.json` is the source of truth. It includes evaluator results, findings, metrics, baseline comparison, and score details.

Score weights:

- `blocker`: 50
- `major`: 30
- `minor`: 15
- `info`: 5

Top-level score is `earnedScore / maxScore`. Pass rate is `passed expectations / total expectations`.

## Debugging Failures

1. Open `review.md` and identify the first finding.
2. Open `audit.json` and inspect the failed evaluator result.
3. Open the referenced trace file under `traces/<scenario>/<agent>.turn-N.json`.
4. Check `diagnostics.error` for provider/auth/router failures.
5. Check `steps[*].toolCalls`, `steps[*].toolResults`, `finishReason`, and `usage`.
6. If behavior is wrong, fix the agent prompt/tool/schema.
7. If behavior is correct but the eval fails, adjust the scenario expectation.
8. Relax thresholds only when the threshold was unrealistic.

Do not call `/models` against custom routers unless the user explicitly asks.

## Good Scenario Patterns

Tool-use scenario:

- Require the correct tool.
- Forbid destructive tools.
- Limit max tool calls.

Multi-turn scenario:

- First turn establishes preference or state.
- Later turn checks whether the agent preserves it.

Structured-output scenario:

- Reference a schema key exposed by the app's eval adapter.
- Add a `schema` expectation with `requireStructuredOutput: true`.

Regression scenario:

- Reproduce a known past failure.
- Keep the prompt and expectation narrow.

Complex live scenario:

- Use deterministic local tools.
- Force required tools only when necessary.
- Let the model produce final text after tools finish.
- Keep latency/token limits realistic for the number of turns and tools.

For OpenAI-compatible routers that do not support Responses API tool-loop continuation, tell the integrator to use `openai.chat(model)` in the registry/adapter.

## Adapter Boundary

If the user asks how agents are registered, explain the split:

- **End user**: writes JSON config and scenario datasets.
- **Integrator/developer**: provides the registry/adapter that registers actual agent factories, tools, and schemas.

When the current CLI only accepts a TypeScript/JavaScript config, treat that as an implementation gap to improve, not the desired user workflow. Recommend adding a first-class registry hook plus a product wrapper that reads `evals/ai-eval.config.json`, resolves `agentKey`, and passes scenarios into `runAgentEval`. The end user should still only edit JSON after the hook exists.
