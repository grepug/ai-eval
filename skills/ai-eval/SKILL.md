---
name: ai-eval
description: Use when helping an end user evaluate their own Vercel AI SDK agent with ai-eval through JSON scenario datasets and configuration, run mock or live evals, interpret scores/reports/traces, compare baselines, and debug failures safely.
---

# AI Eval User Guide

Use this skill to help a user evaluate **their own agent** with `ai-eval`. Treat the user workflow as JSON-config-first: users should write scenario datasets and evaluator settings in JSON. TypeScript agent adapters are an integration detail for the app/team, not the normal user workflow.

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

Important: connecting `agentKey` to a real AI SDK `createAgent()` factory may still require an app-provided adapter or registry. Do not make the end user write that adapter unless they are explicitly acting as the integrator.

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

For OpenAI-compatible routers that do not support Responses API tool-loop continuation, tell the integrator to use `openai.chat(model)` in the agent adapter.

## Adapter Boundary

If the user asks how agents are registered, explain the split:

- **End user**: writes JSON config and scenario datasets.
- **Integrator/developer**: registers actual agent factories, tools, and schemas.

When the current CLI only accepts a TypeScript/JavaScript config, treat that as an implementation gap to improve, not the desired user workflow. Recommend adding a product wrapper that reads `evals/ai-eval.config.json`, resolves `agentKey` from a prebuilt registry, and passes scenarios into `runAgentEval`. The end user should still only edit JSON.
