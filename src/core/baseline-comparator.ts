import { readFile } from 'node:fs/promises';
import { parseJsonObject } from './json.js';
import type { AgentEvalAudit, BaselineComparison, BaselineFinding, EvalFinding } from './types.js';

export async function compareAuditFiles(input: {
  baselinePath: string;
  candidatePath: string;
}): Promise<BaselineComparison> {
  const [baseline, candidate] = await Promise.all([
    readAudit(input.baselinePath),
    readAudit(input.candidatePath),
  ]);
  return compareAgentEvalAudits({ baseline, candidate });
}

export function compareAgentEvalAudits(input: {
  baseline: AgentEvalAudit;
  candidate: AgentEvalAudit;
}): BaselineComparison {
  const baselineFailures = findingMap(input.baseline);
  const candidateFailures = findingMap(input.candidate);
  const regressions = [...candidateFailures.values()]
    .filter((finding) => !baselineFailures.has(findingSignature(finding)))
    .map(toBaselineFinding);
  const improvements = [...baselineFailures.values()]
    .filter((finding) => !candidateFailures.has(findingSignature(finding)))
    .map(toBaselineFinding);
  const metricDeltas = {
    scenarioCount: input.candidate.metrics.scenarioCount - input.baseline.metrics.scenarioCount,
    passedScenarioCount: input.candidate.metrics.passedScenarioCount - input.baseline.metrics.passedScenarioCount,
    failedScenarioCount: input.candidate.metrics.failedScenarioCount - input.baseline.metrics.failedScenarioCount,
    needsReviewScenarioCount: input.candidate.metrics.needsReviewScenarioCount - input.baseline.metrics.needsReviewScenarioCount,
    totalTokens: input.candidate.metrics.totalTokens - input.baseline.metrics.totalTokens,
    maxLatencyMs: input.candidate.metrics.maxLatencyMs - input.baseline.metrics.maxLatencyMs,
  };

  return {
    baselineRunId: input.baseline.evalRun.runId,
    candidateRunId: input.candidate.evalRun.runId,
    status: comparisonStatus(regressions, improvements),
    regressions,
    improvements,
    metricDeltas,
  };
}

async function readAudit(path: string): Promise<AgentEvalAudit> {
  return parseJsonObject(await readFile(path, 'utf8'), path) as AgentEvalAudit;
}

function findingMap(audit: AgentEvalAudit): Map<string, EvalFinding> {
  return new Map(Object.values(audit.findings).map((finding) => [findingSignature(finding), finding]));
}

function findingSignature(finding: EvalFinding): string {
  return `${finding.severity}:${finding.title}:${finding.evidencePath}`;
}

function toBaselineFinding(finding: EvalFinding): BaselineFinding {
  return {
    id: finding.id,
    severity: finding.severity,
    title: finding.title,
    details: finding.details,
  };
}

function comparisonStatus(regressions: BaselineFinding[], improvements: BaselineFinding[]): BaselineComparison['status'] {
  if (regressions.length > 0 && improvements.length > 0) {
    return 'mixed';
  }
  if (regressions.length > 0) {
    return 'regressed';
  }
  if (improvements.length > 0) {
    return 'improved';
  }
  return 'unchanged';
}
