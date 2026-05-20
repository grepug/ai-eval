import { createFailedTrace, normalizeAiSdkResult } from './trace-normalizer.js';
import { snapshotTools } from './tool-snapshot.js';
import type {
  AiSdkAgentDefinition,
  AiSdkEvalTrace,
  EvalMessage,
  EvalScenario,
  ExecutionMode,
  HistoryMode,
} from '../core/types.js';

export interface AiSdkRunScenarioInput {
  agentDefinition: AiSdkAgentDefinition;
  scenario: EvalScenario;
  runId: string;
  timeoutMs?: number;
  includeRawAiSdkResult?: boolean;
  debug?: boolean;
  executionMode?: ExecutionMode;
  historyMode?: HistoryMode;
}

export class AiSdkAgentHarness {
  async runScenario(input: AiSdkRunScenarioInput): Promise<AiSdkEvalTrace[]> {
    const agent = input.agentDefinition.createAgent({
      scenarioId: input.scenario.id,
      runId: input.runId,
      metadata: input.scenario.metadata ?? {},
    });
    const toolSnapshot = snapshotTools(agent, !input.debug);
    const traces: AiSdkEvalTrace[] = [];
    let messages: unknown[] = [];

    for (const [turnIndex, turn] of input.scenario.turns.entries()) {
      messages = [
        ...messages,
        ...toModelMessages(turn.contextMessages ?? []),
        { role: 'user', content: turn.user },
      ];
      const startedAt = new Date();

      try {
        const request = {
          messages,
          timeout: input.timeoutMs ? { totalMs: input.timeoutMs } : undefined,
          include: input.debug ? { requestBody: true, responseBody: true } : undefined,
        };
        const result = input.executionMode === 'stream'
          ? await collectStreamResult(agent.stream?.(request))
          : await agent.generate(request);
        const completedAt = new Date();
        const trace = normalizeAiSdkResult({
          result,
          messages,
          runId: input.runId,
          scenarioId: input.scenario.id,
          agentKey: input.agentDefinition.key,
          turnIndex,
          startedAt,
          completedAt,
          includeRawAiSdkResult: input.includeRawAiSdkResult,
          toolSnapshot,
        });
        traces.push(trace);
        messages = nextHistory(messages, trace, input.historyMode ?? 'ai_sdk_response_messages');
      } catch (error) {
        const completedAt = new Date();
        traces.push(createFailedTrace({
          error,
          messages,
          runId: input.runId,
          scenarioId: input.scenario.id,
          agentKey: input.agentDefinition.key,
          turnIndex,
          startedAt,
          completedAt,
          timeout: isTimeoutError(error),
          toolSnapshot,
        }));
        break;
      }
    }

    return traces;
  }
}

async function collectStreamResult(streamResult: unknown): Promise<unknown> {
  if (!streamResult || typeof streamResult !== 'object') {
    throw new Error('Agent does not support stream execution mode.');
  }

  const record = streamResult as Record<string, unknown>;
  const startedAt = Date.now();
  let firstTokenMs: number | null = null;
  let streamedText = '';

  if (isAsyncIterable(record.textStream)) {
    for await (const chunk of record.textStream) {
      if (firstTokenMs === null) {
        firstTokenMs = Date.now() - startedAt;
      }
      streamedText += String(chunk);
    }
  } else if (typeof record.consumeStream === 'function') {
    await record.consumeStream();
  }

  const resolvedText = await resolveMaybe(record.text);
  const text = streamedText || (typeof resolvedText === 'string' ? resolvedText : '');
  const output = await resolveMaybe(record.output);
  const steps = await resolveMaybe(record.steps) ?? [];
  const response = await resolveMaybe(record.response);
  const finishReason = await resolveMaybe(record.finishReason);
  const totalUsage = await resolveMaybe(record.totalUsage ?? record.usage);

  return {
    text,
    output,
    steps,
    response,
    finishReason,
    totalUsage,
    firstTokenMs,
  };
}

async function resolveMaybe<T>(value: T | Promise<T>): Promise<T> {
  return await value;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value && typeof value === 'object' && Symbol.asyncIterator in value);
}

function toModelMessages(messages: EvalMessage[]): unknown[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.metadata ? { metadata: message.metadata } : {}),
  }));
}

function nextHistory(messages: unknown[], trace: AiSdkEvalTrace, historyMode: HistoryMode): unknown[] {
  if (historyMode === 'final_text_only') {
    return [...messages, { role: 'assistant', content: trace.output.text }];
  }

  if (historyMode === 'custom') {
    return messages;
  }

  return [
    ...messages,
    ...(trace.output.responseMessages ?? [{ role: 'assistant', content: trace.output.text }]),
  ];
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /timeout|aborted|abort/i.test(`${error.name} ${error.message}`);
}
