# AI Eval Framework Roadmap

## Milestone 1: Core Runnable Framework

- TypeScript config loader.
- JSON scenario loader.
- AI SDK `generate()` harness for `ToolLoopAgent`-compatible agents.
- Trace normalization for steps, text, structured output, response messages,
  usage, finish reason, timing, and diagnostics.
- Built-in deterministic evaluators: tool usage, latency, token budget, step
  count, finish reason, schema, and text contains.
- Artifact writer for `audit.json`, `review.md`, `summary.json`, and per-turn
  trace JSON.
- CLI commands: `run`, `compare`, and `review`.
- Unit tests with mocked AI SDK results.

## Milestone 2: Richer Eval Evidence

- Streaming execution mode with first-token latency.
- Compact tool snapshots in standard traces and full snapshots in debug mode.
- Baseline gates that block on new blocker findings.
- Optional LLM judge integration through a project-provided evaluator.
- Redaction hooks for traces and findings.
- Richer markdown report for PR review.

## Milestone 3: Scale and CI

- Multi-agent comparison reports.
- Model and prompt matrix runs.
- Scenario tags and suites.
- CI annotations.
- Historical trend summaries.
- Future adapter boundary for non-AI-SDK runtimes.
