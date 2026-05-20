import { createTraceId } from '../core/ids.js';
import type {
  AiSdkEvalTrace,
  AiSdkEvalUsage,
  AiSdkEvalToolCall,
  AiSdkEvalToolResult,
  ToolSnapshot,
} from '../core/types.js';

export interface NormalizeAiSdkResultInput {
  result: unknown;
  messages: unknown[];
  runId: string;
  scenarioId: string;
  agentKey: string;
  turnIndex: number;
  startedAt: Date;
  completedAt: Date;
  includeRawAiSdkResult?: boolean;
  toolSnapshot?: ToolSnapshot[];
}

export function normalizeAiSdkResult(input: NormalizeAiSdkResultInput): AiSdkEvalTrace {
  const result = asRecord(input.result);
  const rawSteps = safeGet(result, 'steps');
  const steps = Array.isArray(rawSteps) ? rawSteps.map(asRecord) : [];
  const normalizedSteps = steps.map((step, index) => {
    const response = asRecordOrUndefined(step.response);
    const request = asRecordOrUndefined(step.request);
    return {
      index: typeof step.stepNumber === 'number' ? step.stepNumber : index,
      stepType: stringifyOptional(safeGet(step, 'stepType')),
      text: stringifyOptional(safeGet(step, 'text')),
      finishReason: stringifyOptional(safeGet(step, 'finishReason')),
      rawFinishReason: safeGet(step, 'rawFinishReason'),
      toolCalls: normalizeToolCalls(safeGet(step, 'toolCalls')),
      toolResults: normalizeToolResults(safeGet(step, 'toolResults')),
      usage: normalizeUsage(safeGet(step, 'usage')),
      warnings: Array.isArray(safeGet(step, 'warnings')) ? safeGet(step, 'warnings') as unknown[] : undefined,
      providerMetadata: safeGet(step, 'providerMetadata'),
      request: request ? { body: request.body } : undefined,
      response: response
        ? {
            id: stringifyOptional(response.id),
            modelId: stringifyOptional(response.modelId),
            timestamp: normalizeTimestamp(response.timestamp),
            body: response.body,
            messages: Array.isArray(response.messages) ? response.messages : undefined,
          }
        : undefined,
      timing: undefined,
    };
  });

  const usage = normalizeUsage(safeGet(result, 'totalUsage') ?? safeGet(result, 'usage'));
  const toolCallCount = normalizedSteps.reduce((total, step) => total + step.toolCalls.length, 0);
  const toolResultCount = normalizedSteps.reduce((total, step) => total + step.toolResults.length, 0);
  const durationMs = input.completedAt.getTime() - input.startedAt.getTime();
  const firstTokenMs = typeof safeGet(result, 'firstTokenMs') === 'number' ? safeGet(result, 'firstTokenMs') as number : null;
  const output = safeGet(result, 'output');
  const response = asRecordOrUndefined(safeGet(result, 'response'));
  const text = safeGet(result, 'text');
  const finishReason = safeGet(result, 'finishReason');

  return {
    schemaVersion: 'ai-sdk-eval-trace.v1',
    traceId: createTraceId(input.runId, input.scenarioId, input.agentKey, input.turnIndex),
    runId: input.runId,
    scenarioId: input.scenarioId,
    agentKey: input.agentKey,
    turnIndex: input.turnIndex,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    status: 'completed',
    input: {
      turnsCompletedBeforeRun: input.turnIndex,
      messages: input.messages,
    },
    output: {
      text: typeof text === 'string' ? text : '',
      structured: output,
      responseMessages: response?.messages as unknown[] | undefined,
      finishReason: stringifyOptional(finishReason),
    },
    steps: normalizedSteps,
    usage,
    timing: {
      durationMs,
      firstTokenMs,
      maxStepMs: null,
    },
    diagnostics: {
      timeout: false,
      stepCount: normalizedSteps.length,
      toolCallCount,
      toolResultCount,
    },
    toolSnapshot: input.toolSnapshot,
    raw: input.includeRawAiSdkResult ? input.result : undefined,
  };
}

export function createFailedTrace(input: {
  error: unknown;
  messages: unknown[];
  runId: string;
  scenarioId: string;
  agentKey: string;
  turnIndex: number;
  startedAt: Date;
  completedAt: Date;
  timeout?: boolean;
  toolSnapshot?: ToolSnapshot[];
}): AiSdkEvalTrace {
  const error = input.error instanceof Error ? input.error : new Error(String(input.error));
  return {
    schemaVersion: 'ai-sdk-eval-trace.v1',
    traceId: createTraceId(input.runId, input.scenarioId, input.agentKey, input.turnIndex),
    runId: input.runId,
    scenarioId: input.scenarioId,
    agentKey: input.agentKey,
    turnIndex: input.turnIndex,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    status: input.timeout ? 'timeout' : 'failed',
    input: {
      turnsCompletedBeforeRun: input.turnIndex,
      messages: input.messages,
    },
    output: { text: '' },
    steps: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    timing: { durationMs: input.completedAt.getTime() - input.startedAt.getTime() },
    diagnostics: {
      timeout: Boolean(input.timeout),
      stepCount: 0,
      toolCallCount: 0,
      toolResultCount: 0,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    },
    toolSnapshot: input.toolSnapshot,
  };
}

export function normalizeUsage(value: unknown): AiSdkEvalUsage {
  const usage = asRecordOrUndefined(value) ?? {};
  const inputDetails = asRecordOrUndefined(usage.inputTokenDetails) ?? {};
  const outputDetails = asRecordOrUndefined(usage.outputTokenDetails) ?? {};
  return {
    inputTokens: numberOrZero(usage.inputTokens),
    outputTokens: numberOrZero(usage.outputTokens),
    totalTokens: numberOrZero(usage.totalTokens),
    reasoningTokens: numberOrUndefined(usage.reasoningTokens ?? outputDetails.reasoningTokens),
    cacheReadTokens: numberOrUndefined(usage.cacheReadTokens ?? usage.cachedInputTokens ?? inputDetails.cacheReadTokens),
    cacheWriteTokens: numberOrUndefined(usage.cacheWriteTokens ?? inputDetails.cacheWriteTokens),
  };
}

function normalizeToolCalls(value: unknown): AiSdkEvalToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((call, index) => {
    const record = asRecord(call);
    return {
      toolCallId: stringifyOptional(record.toolCallId) ?? `tool-call-${index}`,
      toolName: stringifyOptional(record.toolName) ?? 'unknown-tool',
      input: record.input ?? record.args,
    };
  });
}

function normalizeToolResults(value: unknown): AiSdkEvalToolResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((result, index) => {
    const record = asRecord(result);
    return {
      toolCallId: stringifyOptional(record.toolCallId) ?? `tool-result-${index}`,
      toolName: stringifyOptional(record.toolName) ?? 'unknown-tool',
      output: record.output ?? record.result,
      isError: Boolean(record.isError),
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function safeGet(record: Record<string, unknown>, key: string): unknown {
  try {
    return record[key];
  } catch {
    return undefined;
  }
}

function asRecordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function stringifyOptional(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : undefined;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
