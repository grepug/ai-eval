import { randomUUID } from 'node:crypto';

export function createRunId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

export function createTraceId(runId: string, scenarioId: string, agentKey: string, turnIndex: number): string {
  return `${runId}.${safePathSegment(scenarioId)}.${safePathSegment(agentKey)}.turn-${turnIndex + 1}.${randomUUID()}`;
}

export function safePathSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unnamed';
}

export function traceArtifactPath(input: { scenarioId: string; agentKey: string; turnIndex: number }): string {
  return `traces/${safePathSegment(input.scenarioId)}/${safePathSegment(input.agentKey)}.turn-${input.turnIndex + 1}.json`;
}

export function findingId(input: {
  scenarioId: string;
  agentKey: string;
  expectationId: string;
  findingId: string;
  index: number;
}): string {
  return [
    safePathSegment(input.scenarioId),
    safePathSegment(input.agentKey),
    safePathSegment(input.expectationId),
    safePathSegment(input.findingId),
    input.index,
  ].join('.');
}
