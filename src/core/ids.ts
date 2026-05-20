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
