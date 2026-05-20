import type {
  AiSdkEvalTrace,
  EvalExpectation,
  EvalFinding,
  EvaluatorResult,
  FindingSeverity,
} from '../core/types.js';
import { traceArtifactPath } from '../core/ids.js';

export function createPassed(expectation: EvalExpectation, metrics?: EvaluatorResult['metrics']): EvaluatorResult {
  return {
    expectationId: expectation.id,
    status: 'passed',
    findings: [],
    metrics,
  };
}

export function createFailed(
  expectation: EvalExpectation,
  title: string,
  details: string,
  evidencePath: string,
  recommendation?: string,
  metrics?: EvaluatorResult['metrics'],
): EvaluatorResult {
  return {
    expectationId: expectation.id,
    status: expectation.severity === 'info' ? 'warning' : 'failed',
    findings: [
      {
        id: `${expectation.id}-finding`,
        severity: expectation.severity,
        title,
        details,
        evidencePath,
        recommendation,
      },
    ],
    metrics,
  };
}

export function allToolNames(traces: AiSdkEvalTrace[]): string[] {
  return traces.flatMap((trace) => trace.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)));
}

export function allText(traces: AiSdkEvalTrace[]): string {
  return traces.map((trace) => trace.output.text).join('\n');
}

export function evidencePathForTrace(trace?: AiSdkEvalTrace): string {
  if (!trace) {
    return 'audit.json';
  }
  return traceArtifactPath(trace);
}

export function maxSeverity(findings: EvalFinding[]): FindingSeverity | null {
  const order: FindingSeverity[] = ['blocker', 'major', 'minor', 'info'];
  for (const severity of order) {
    if (findings.some((finding) => finding.severity === severity)) {
      return severity;
    }
  }
  return null;
}

export function configRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
