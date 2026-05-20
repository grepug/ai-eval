import { describe, expect, it } from 'vitest';
import { compareAgentEvalAudits } from '../src/core/baseline-comparator.js';
import type { AgentEvalAudit } from '../src/core/types.js';

const baseAudit: AgentEvalAudit = {
  schemaVersion: 'agent-eval-audit.v1',
  evalRun: {
    runId: 'baseline',
    createdAt: '2026-05-20T00:00:00.000Z',
    completedAt: '2026-05-20T00:00:01.000Z',
    status: 'completed',
    decision: 'passed',
    mode: 'standard',
  },
  agents: {},
  scenarioOrder: [],
  scenarios: {},
  findingOrder: [],
  findings: {},
  metrics: {
    scenarioCount: 1,
    passedScenarioCount: 1,
    failedScenarioCount: 0,
    needsReviewScenarioCount: 0,
    expectationCount: 1,
    passedExpectationCount: 1,
    failedExpectationCount: 0,
    warningExpectationCount: 0,
    needsReviewExpectationCount: 0,
    passRate: 1,
    score: 1,
    scorePercent: 100,
    maxScore: 50,
    earnedScore: 50,
    totalTokens: 10,
    maxLatencyMs: 100,
    avgLatencyMs: 100,
    totalCost: null,
  },
};

describe('compareAgentEvalAudits', () => {
  it('marks new findings as regressions', () => {
    const candidate: AgentEvalAudit = {
      ...baseAudit,
      evalRun: { ...baseAudit.evalRun, runId: 'candidate', status: 'completed_with_failures', decision: 'blocked' },
      findingOrder: ['finding-1'],
      findings: {
        'finding-1': {
          id: 'finding-1',
          severity: 'blocker',
          title: 'Tool usage expectation failed',
          details: 'Missing weather tool.',
          evidencePath: 'traces/weather/weather-agent.turn-1.json',
        },
      },
      metrics: {
        ...baseAudit.metrics,
        failedScenarioCount: 1,
        passedScenarioCount: 0,
        totalTokens: 15,
      },
    };

    const comparison = compareAgentEvalAudits({ baseline: baseAudit, candidate });

    expect(comparison.status).toBe('regressed');
    expect(comparison.regressions).toHaveLength(1);
    expect(comparison.metricDeltas.totalTokens).toBe(5);
  });
});
