---
name: ai-eval
description: Use when creating, running, debugging, or explaining eval scenarios for this AI SDK-first agent eval framework, including datasets, live/mock examples, scorers, reports, traces, and baseline comparisons.
---

# AI Eval Framework

Use this skill when working in this repo or helping a user adopt `ai-eval`.

## Core Model

Think in Vercel-style eval terms:

- **Dataset**: scenario JSON files under a scenario directory.
- **Runner**: `agent-eval run` or `runAgentEval`.
- **Scorer**: built-in evaluators that emit pass/fail/warning/needs_review plus metrics.
- **Report**: `review.md`, `summary.json`, `audit.json`, and per-turn traces.

Public terms must stay consistent: `scenario`, `turn`, `trace`, `step`, `evaluator`, `finding`, `audit`, `review`, `baseline`.

## Safety Rules

- Never commit `.env`, API keys, live traces with secrets, or `eval-runs/`.
- Do not call `/models` against custom routers unless the user explicitly asks.
- Use `/tmp` files for long CLI bodies or generated PR comments.
- Prefer deterministic local tools in examples; live examples should test agent behavior, not third-party API uptime.
- If a live eval fails, inspect `review.md`, `audit.json`, and trace diagnostics before changing code.

## Standard Commands

Run checks:

```bash
pnpm check
```

Run the mock example:

```bash
pnpm example:mock
```

Run the simple live weather example:

```bash
pnpm example:live
```

Run the complex live trip planner example:

```bash
pnpm example:trip-live
```

Run a custom dataset:

```bash
node --env-file-if-exists=.env dist/cli/index.js run \
  --config ./agent-eval.config.ts \
  --scenarios ./evals/scenarios \
  --output-dir /tmp/my-agent-eval-run \
  --timeout-ms 90000 \
  --json
```

## Scenario Shape

A scenario is one eval case:

```json
{
  "id": "stable-id",
  "title": "Human-readable title",
  "kind": "tool_loop",
  "tags": ["smoke"],
  "turns": [
    { "user": "User prompt" }
  ],
  "expectations": [
    {
      "id": "uses-required-tool",
      "evaluator": "tool-usage",
      "severity": "blocker",
      "config": {
        "requiredToolCalls": ["weather"]
      }
    }
  ]
}
```

Use `multi_turn` when memory/state matters. The runner carries forward AI SDK response messages by default.

## Built-In Evaluators

- `tool-usage`: required/forbidden tools, order, max tool count.
- `text-contains`: required/forbidden final text.
- `step-count`: AI SDK loop step budget.
- `finish-reason`: expected finish reasons such as `stop`.
- `latency`: max run/turn/first-token time.
- `token-budget`: input/output/total token limits.
- `schema`: structured output against a registered Zod schema.
- `human-review`: marks an expectation as needing review.
- `llm-judge`: placeholder; register a project-specific judge for real scoring.

Severity weights for score:

- `blocker`: 50
- `major`: 30
- `minor`: 15
- `info`: 5

Top-level score is `earnedScore / maxScore`; pass rate is `passed expectations / total expectations`.

## Debug Workflow

1. Run the eval and note `decision`, `scorePercent`, and `passRate`.
2. Read `review.md` first for findings.
3. Read `audit.json` for evaluator results and metrics.
4. Read traces under `traces/<scenario>/<agent>.turn-N.json` for step-level evidence.
5. If the failure is provider/auth/router related, inspect the trace diagnostic error and avoid broad code changes.
6. If the failure is expected behavior drift, update agent instructions/tools first, not evaluator thresholds.
7. Relax thresholds only when the live behavior is correct and the original threshold was unrealistic.

## Example Patterns

Simple live example:

- `examples/live-weather-agent/agent-eval.config.ts`
- `examples/live-weather-agent/scenarios/weather-tool-required.json`

Complex live example:

- `examples/live-trip-planner-agent/agent-eval.config.ts`
- `examples/live-trip-planner-agent/scenarios/tokyo-trip-planning.json`

For live OpenAI-compatible routers, prefer `openai.chat(model)` when the router does not support OpenAI Responses API tool-loop continuation semantics.
