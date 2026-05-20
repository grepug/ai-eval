import { readFile } from 'node:fs/promises';
import { AiSdkAgentHarness } from '../ai-sdk/agent-harness.js';
import { compareAgentEvalAudits } from './baseline-comparator.js';
import { resolveEvaluators } from './evaluator-registry.js';
import { createRunId, findingId, traceArtifactPath } from './ids.js';
import { parseJsonObject } from './json.js';
import { validateScenarios } from './scenario-loader.js';
import { writeArtifacts } from './artifact-writer.js';
import { renderAgentEvalReview } from './review.js';
import type {
  AgentAuditSummary,
  AgentEvalAudit,
  AgentEvalDecision,
  AgentEvalResult,
  AgentEvalRunStatus,
  AgentScenarioResult,
  AiSdkEvalTrace,
  EvalFinding,
  EvaluatorResult,
  RunAgentEvalInput,
  ScenarioAuditResult,
} from './types.js';

export async function runAgentEval(input: RunAgentEvalInput): Promise<AgentEvalResult> {
  const runId = createRunId();
  const createdAt = new Date();
  const mode = input.mode ?? 'standard';
  const scenarios = validateScenarios(input.scenarios)
    .filter((scenario) => !input.scenarioId || scenario.id === input.scenarioId);
  const agents = input.agents.filter((agent) => !input.agentKey || agent.key === input.agentKey);

  if (agents.length === 0) {
    throw new Error('No agents matched the eval input.');
  }
  if (scenarios.length === 0) {
    throw new Error('No scenarios matched the eval input.');
  }

  const evaluatorRegistry = resolveEvaluators(input.evaluators);
  const harness = new AiSdkAgentHarness();
  const tracesByScenarioAgent: Record<string, AiSdkEvalTrace[]> = {};
  const scenarioResults: Record<string, ScenarioAuditResult> = {};
  const findings: Record<string, EvalFinding> = {};
  const findingOrder: string[] = [];
  const tasks = scenarios.flatMap((scenario) => agents.map((agent) => ({ scenario, agent })));
  const taskResults = await mapWithConcurrency(tasks, input.concurrency ?? 1, async ({ scenario, agent }) => {
    const traces = await harness.runScenario({
      agentDefinition: agent,
      scenario,
      runId,
      timeoutMs: input.timeoutMs,
      includeRawAiSdkResult: input.includeRawAiSdkResult || mode === 'debug',
      debug: mode === 'debug',
      executionMode: input.executionMode ?? 'generate',
      historyMode: input.historyMode,
    });
    const redactedTraces = input.redactor ? traces.map((trace) => input.redactor?.redactTrace(trace) ?? trace) : traces;
    const evaluatorResults = await evaluateScenario({
      scenario,
      agentKey: agent.key,
      traces: redactedTraces,
      evaluatorRegistry,
      schemas: input.schemas,
      pricing: input.pricing,
    });
    return { scenario, agent, traces: redactedTraces, evaluatorResults };
  });

  for (const scenario of scenarios) {
    const agentResults: Record<string, AgentScenarioResult> = {};

    for (const agent of agents) {
      const result = taskResults.find((item) => item.scenario.id === scenario.id && item.agent.key === agent.key);
      if (!result) {
        throw new Error(`Missing run result for scenario ${scenario.id} and agent ${agent.key}.`);
      }
      const redactedTraces = result.traces;
      const key = `${scenario.id}:${agent.key}`;
      tracesByScenarioAgent[key] = redactedTraces;
      const evaluatorResults = result.evaluatorResults;
      const agentStatus = statusFromEvaluatorResults(redactedTraces, evaluatorResults);

      for (const result of evaluatorResults) {
        for (const [index, finding] of result.findings.entries()) {
          const namespaced = {
            ...finding,
            id: findingId({
              scenarioId: scenario.id,
              agentKey: agent.key,
              expectationId: result.expectationId,
              findingId: finding.id,
              index,
            }),
          };
          const redacted = input.redactor?.redactFinding?.(namespaced) ?? namespaced;
          if (!findings[redacted.id]) {
            findingOrder.push(redacted.id);
          }
          findings[redacted.id] = redacted;
        }
      }

      agentResults[agent.key] = {
        agentKey: agent.key,
        tracePaths: redactedTraces.map(traceArtifactPath),
        evaluatorResults,
        summary: {
          status: agentStatus,
          stepCount: redactedTraces.reduce((total, trace) => total + trace.diagnostics.stepCount, 0),
          toolCallCount: redactedTraces.reduce((total, trace) => total + trace.diagnostics.toolCallCount, 0),
          durationMs: redactedTraces.reduce((total, trace) => total + trace.timing.durationMs, 0),
          totalTokens: redactedTraces.reduce((total, trace) => total + trace.usage.totalTokens, 0),
        },
      };
    }

    scenarioResults[scenario.id] = {
      id: scenario.id,
      title: scenario.title,
      kind: scenario.kind,
      status: scenarioStatus(Object.values(agentResults)),
      agentResults,
    };
  }

  const completedAt = new Date();
  const audit: AgentEvalAudit = {
    schemaVersion: 'agent-eval-audit.v1',
    evalRun: {
      runId,
      runName: input.runName,
      createdAt: createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
      status: runStatus(Object.values(scenarioResults)),
      decision: runDecision(Object.values(scenarioResults)),
      mode,
    },
    agents: summarizeAgents(agents, scenarioResults),
    scenarioOrder: scenarios.map((scenario) => scenario.id),
    scenarios: scenarioResults,
    findingOrder,
    findings,
    metrics: summarizeRun(Object.values(scenarioResults)),
  };

  if (input.baselineAuditPath) {
    const baseline = parseJsonObject(await readFile(input.baselineAuditPath, 'utf8'), input.baselineAuditPath) as AgentEvalAudit;
    audit.baseline = compareAgentEvalAudits({ baseline, candidate: audit });
    if (audit.baseline.status === 'regressed' || audit.baseline.status === 'mixed') {
      audit.evalRun.decision = 'blocked';
      audit.evalRun.status = 'completed_with_failures';
    }
  }

  const artifacts = await writeArtifacts({ outputDir: input.outputDir, audit, tracesByScenarioAgent });
  const reviewMarkdown = renderAgentEvalReview(audit);

  return {
    audit,
    reviewMarkdown,
    outputDir: input.outputDir,
    summary: {
      runId,
      decision: audit.evalRun.decision,
      status: audit.evalRun.status,
      auditPath: artifacts.auditPath,
      reviewPath: artifacts.reviewPath,
      summaryPath: artifacts.summaryPath,
    },
  };
}

async function evaluateScenario(input: {
  scenario: RunAgentEvalInput['scenarios'][number];
  agentKey: string;
  traces: AiSdkEvalTrace[];
  evaluatorRegistry: ReturnType<typeof resolveEvaluators>;
  schemas: RunAgentEvalInput['schemas'];
  pricing: RunAgentEvalInput['pricing'];
}): Promise<EvaluatorResult[]> {
  const results: EvaluatorResult[] = [];

  for (const expectation of input.scenario.expectations) {
    const evaluator = input.evaluatorRegistry[expectation.evaluator];
    if (!evaluator) {
      results.push({
        expectationId: expectation.id,
        status: 'failed',
        findings: [
          {
            id: `${expectation.id}-unknown-evaluator`,
            severity: expectation.severity,
            title: 'Unknown evaluator',
            details: `No evaluator is registered with key "${expectation.evaluator}".`,
            evidencePath: 'audit.json',
            recommendation: 'Register a custom evaluator or use a built-in evaluator key.',
          },
        ],
      });
      continue;
    }

    try {
      results.push(await evaluator.evaluate({
        scenario: input.scenario,
        agentKey: input.agentKey,
        traces: input.traces,
        expectation,
        schemas: input.schemas,
        pricing: input.pricing,
      }));
    } catch (error) {
      results.push({
        expectationId: expectation.id,
        status: 'failed',
        findings: [
          {
            id: `${expectation.id}-evaluator-error`,
            severity: expectation.severity,
            title: 'Evaluator failed',
            details: error instanceof Error ? error.message : String(error),
            evidencePath: 'audit.json',
            recommendation: 'Fix the evaluator implementation or expectation config.',
          },
        ],
      });
    }
  }

  for (const trace of input.traces) {
    if (trace.status !== 'completed') {
      results.push({
        expectationId: `${trace.traceId}-execution`,
        status: 'failed',
        findings: [
          {
            id: `${trace.traceId}-execution-failed`,
            severity: 'blocker',
            title: 'Agent execution failed',
            details: trace.diagnostics.error?.message ?? trace.status,
            evidencePath: traceArtifactPath(trace),
            recommendation: 'Inspect the trace diagnostics and provider/tool error.',
          },
        ],
      });
    }
  }

  return results;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: TOutput[] = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index] as TInput);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function statusFromEvaluatorResults(traces: AiSdkEvalTrace[], results: EvaluatorResult[]): AgentScenarioResult['summary']['status'] {
  if (traces.some((trace) => trace.status !== 'completed') || results.some((result) => result.status === 'failed')) {
    return 'failed';
  }
  if (results.some((result) => result.status === 'needs_review')) {
    return 'needs_review';
  }
  return 'passed';
}

function scenarioStatus(results: AgentScenarioResult[]): ScenarioAuditResult['status'] {
  if (results.some((result) => result.summary.status === 'failed')) {
    return 'failed';
  }
  if (results.some((result) => result.summary.status === 'needs_review')) {
    return 'needs_review';
  }
  return 'passed';
}

function runStatus(results: ScenarioAuditResult[]): AgentEvalRunStatus {
  return results.some((result) => result.status === 'failed') ? 'completed_with_failures' : 'completed';
}

function runDecision(results: ScenarioAuditResult[]): AgentEvalDecision {
  if (results.some((result) => result.status === 'failed')) {
    return 'blocked';
  }
  if (results.some((result) => result.status === 'needs_review')) {
    return 'needs_review';
  }
  return 'passed';
}

function summarizeAgents(agents: RunAgentEvalInput['agents'], scenarios: Record<string, ScenarioAuditResult>): Record<string, AgentAuditSummary> {
  return Object.fromEntries(agents.map((agent) => {
    const agentResults = Object.values(scenarios)
      .map((scenario) => scenario.agentResults[agent.key])
      .filter(Boolean);
    const latencies = agentResults.map((result) => result.summary.durationMs);
    return [agent.key, {
      key: agent.key,
      name: agent.name,
      modelIds: [],
      scenarioCount: agentResults.length,
      passedScenarioCount: agentResults.filter((result) => result.summary.status === 'passed').length,
      failedScenarioCount: agentResults.filter((result) => result.summary.status === 'failed').length,
      needsReviewScenarioCount: agentResults.filter((result) => result.summary.status === 'needs_review').length,
      totalTokens: agentResults.reduce((total, result) => total + result.summary.totalTokens, 0),
      totalCost: null,
      maxLatencyMs: Math.max(0, ...latencies),
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length) : null,
    }];
  }));
}

function summarizeRun(scenarios: ScenarioAuditResult[]): AgentEvalAudit['metrics'] {
  const agentResults = scenarios.flatMap((scenario) => Object.values(scenario.agentResults));
  const latencies = agentResults.map((result) => result.summary.durationMs);
  return {
    scenarioCount: scenarios.length,
    passedScenarioCount: scenarios.filter((scenario) => scenario.status === 'passed').length,
    failedScenarioCount: scenarios.filter((scenario) => scenario.status === 'failed').length,
    needsReviewScenarioCount: scenarios.filter((scenario) => scenario.status === 'needs_review').length,
    totalTokens: agentResults.reduce((total, result) => total + result.summary.totalTokens, 0),
    maxLatencyMs: Math.max(0, ...latencies),
    avgLatencyMs: latencies.length ? Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length) : null,
    totalCost: null,
  };
}
