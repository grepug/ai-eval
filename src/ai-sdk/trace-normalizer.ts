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
  const steps = Array.isArray(result.steps) ? result.steps.map(asRecord) : [];
  const normalizedSteps = steps.map((step, index) => {
    const response = asRecordOrUndefined(step.response);
    const request = asRecordOrUndefined(step.request);
    return {
      index: typeof step.stepNumber === 'number' ? step.stepNumber : index,
      stepType: typeof step.stepType === 'string' ? step.stepType : undefined,
      text: typeof step.text === 'string' ? step.text : undefined,
      finishReason: stringifyOptional(step.finishReason),
      rawFinishReason: step.rawFinishReason,
      toolCalls: normalizeToolCalls(step.toolCalls),
      toolResults: normalizeToolResults(step.toolResults),
      usage: normalizeUsage(step.usage),
      warnings: Array.isArray(step.warnings) ? step.warnings : undefined,
      providerMetadata: step.providerMetadata,
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

  const usage = normalizeUsage(result.totalUsage ?? result.usage);
  const toolCallCount = normalizedSteps.reduce((total, step) => total + step.toolCalls.length, 0);
  const toolResultCount = normalizedSteps.reduce((total, step) => total + step.toolResults.length, 0);
  const durationMs = input.completedAt.getTime() - input.startedAt.getTime();

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
      text: typeof result.text === 'string' ? result.text : '',
      structured: result.output,
      responseMessages: asRecordOrUndefined(result.response)?.messages as unknown[] | undefined,
      finishReason: stringifyOptional(result.finishReason),
    },
    steps: normalizedSteps,
    usage,
    timing: {
      durationMs,
      firstTokenMs: null,
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
