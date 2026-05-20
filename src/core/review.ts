import type { AgentEvalAudit, EvalFinding, FindingSeverity } from './types.js';

export function renderAgentEvalReview(audit: AgentEvalAudit): string {
  const findings = audit.findingOrder.map((id) => audit.findings[id]).filter(Boolean);
  const priority = highestSeverity(findings) ?? 'none';
  const scenarioRows = audit.scenarioOrder
    .map((id) => audit.scenarios[id])
    .filter(Boolean)
    .map((scenario) => `| ${scenario.id} | ${scenario.status} | ${Object.keys(scenario.agentResults).join(', ')} |`)
    .join('\n');

  return [
    `# Agent Eval ${audit.evalRun.runId}`,
    '',
    `Decision: ${title(audit.evalRun.decision)}`,
    `Highest priority: ${priority}`,
    '',
    '## Review First',
    findings.length === 0
      ? 'No findings.'
      : findings.slice(0, 10).map((finding, index) => `${index + 1}. ${title(finding.severity)} ${finding.title}: ${finding.details ?? finding.evidencePath}`).join('\n'),
    '',
    '## Metrics',
    `- Scenarios: ${audit.metrics.scenarioCount}`,
    `- Passed: ${audit.metrics.passedScenarioCount}`,
    `- Failed: ${audit.metrics.failedScenarioCount}`,
    `- Needs review: ${audit.metrics.needsReviewScenarioCount}`,
    `- Total tokens: ${audit.metrics.totalTokens}`,
    `- Max latency: ${audit.metrics.maxLatencyMs}ms`,
    '',
    '## Scenario Results',
    '| Scenario | Status | Agents |',
    '| --- | --- | --- |',
    scenarioRows || '| none | none | none |',
    '',
    '## Baseline',
    audit.baseline
      ? `Status: ${audit.baseline.status}. Regressions: ${audit.baseline.regressions.length}. Improvements: ${audit.baseline.improvements.length}.`
      : 'No baseline comparison was provided.',
    '',
    '## Artifacts',
    '- audit.json',
    '- summary.json',
    '- traces/',
    '',
  ].join('\n');
}

function highestSeverity(findings: EvalFinding[]): FindingSeverity | null {
  const order: FindingSeverity[] = ['blocker', 'major', 'minor', 'info'];
  return order.find((severity) => findings.some((finding) => finding.severity === severity)) ?? null;
}

function title(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
