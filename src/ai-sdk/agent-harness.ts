import { createFailedTrace, normalizeAiSdkResult } from './trace-normalizer.js';
import { snapshotTools } from './tool-snapshot.js';
import type {
  AiSdkAgentDefinition,
  AiSdkEvalTrace,
  EvalMessage,
  EvalScenario,
  HistoryMode,
} from '../core/types.js';

export interface AiSdkRunScenarioInput {
  agentDefinition: AiSdkAgentDefinition;
  scenario: EvalScenario;
  runId: string;
  timeoutMs?: number;
  includeRawAiSdkResult?: boolean;
  debug?: boolean;
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
        const result = await agent.generate({
          messages,
          timeout: input.timeoutMs ? { totalMs: input.timeoutMs } : undefined,
          include: input.debug ? { requestBody: true, responseBody: true } : undefined,
        });
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
