import type { z } from 'zod';

export type AgentEvalMode = 'standard' | 'debug';
export type EvalStatus = 'passed' | 'failed' | 'needs_review';
export type FindingSeverity = 'blocker' | 'major' | 'minor' | 'info';
export type EvaluatorStatus = 'passed' | 'failed' | 'warning' | 'not_applicable' | 'needs_review';
export type TraceStatus = 'completed' | 'failed' | 'timeout';
export type ExecutionMode = 'generate' | 'stream';
export type HistoryMode = 'ai_sdk_response_messages' | 'final_text_only' | 'custom';

export interface AiSdkAgentLike {
  generate(input: unknown): Promise<unknown>;
  stream?(input: unknown): unknown;
}

export interface AiSdkGenerateInput {
  messages?: unknown[];
  prompt?: string | unknown[];
  timeout?: number | { totalMs?: number; stepMs?: number; chunkMs?: number };
  include?: { requestBody?: boolean; responseBody?: boolean };
  onStepFinish?: (event: unknown) => PromiseLike<void> | void;
  onFinish?: (event: unknown) => PromiseLike<void> | void;
}

export interface AiSdkAgentDefinition {
  key: string;
  name: string;
  description?: string;
  createAgent: (input: AiSdkAgentCreateInput) => AiSdkAgentLike;
}

export interface AiSdkAgentCreateInput {
  scenarioId: string;
  runId: string;
  metadata: Record<string, unknown>;
}

export interface AgentEvalConfig {
  agents: AiSdkAgentDefinition[];
  scenarios?: EvalScenario[];
  evaluators?: Array<string | Evaluator>;
  schemas?: Record<string, z.ZodType<unknown>>;
  pricing?: Record<string, ModelPrice>;
  redactor?: Redactor;
}

export interface RunAgentEvalInput extends AgentEvalConfig {
  runName?: string;
  scenarios: EvalScenario[];
  outputDir: string;
  concurrency?: number;
  timeoutMs?: number;
  baselineAuditPath?: string;
  includeRawAiSdkResult?: boolean;
  mode?: AgentEvalMode;
  executionMode?: ExecutionMode;
  historyMode?: HistoryMode;
  agentKey?: string;
  scenarioId?: string;
}

export interface AgentEvalResult {
  audit: AgentEvalAudit;
  reviewMarkdown: string;
  summary: AgentEvalSummary;
  outputDir: string;
}

export interface AgentEvalSummary {
  runId: string;
  decision: AgentEvalDecision;
  status: AgentEvalRunStatus;
  score: number;
  scorePercent: number;
  passRate: number;
  auditPath: string;
  reviewPath: string;
  summaryPath: string;
}

export type AgentEvalDecision = 'passed' | 'blocked' | 'needs_review';
export type AgentEvalRunStatus = 'completed' | 'completed_with_failures' | 'failed';

export interface EvalScenario {
  id: string;
  title: string;
  description?: string;
  kind: 'single_turn' | 'multi_turn' | 'tool_loop' | 'structured_output' | 'safety' | 'regression';
  tags?: string[];
  turns: EvalScenarioTurn[];
  expectations: EvalExpectation[];
  metadata?: Record<string, unknown>;
}

export interface EvalScenarioTurn {
  user: string;
  contextMessages?: EvalMessage[];
  expectedState?: unknown;
}

export interface EvalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | unknown;
  metadata?: Record<string, unknown>;
}

export interface EvalExpectation {
  id: string;
  evaluator: string;
  severity: FindingSeverity;
  config?: unknown;
}

export interface AiSdkEvalTrace {
  schemaVersion: 'ai-sdk-eval-trace.v1';
  traceId: string;
  runId: string;
  scenarioId: string;
  agentKey: string;
  turnIndex: number;
  startedAt: string;
  completedAt: string | null;
  status: TraceStatus;
  input: AiSdkEvalInputSnapshot;
  output: AiSdkEvalOutputSnapshot;
  steps: AiSdkEvalStepTrace[];
  usage: AiSdkEvalUsage;
  timing: AiSdkEvalTiming;
  diagnostics: AiSdkEvalDiagnostics;
  toolSnapshot?: ToolSnapshot[];
  raw?: unknown;
}

export interface AiSdkEvalInputSnapshot {
  turnsCompletedBeforeRun: number;
  messages: unknown[];
  metadata?: Record<string, unknown>;
}

export interface AiSdkEvalOutputSnapshot {
  text: string;
  structured?: unknown;
  responseMessages?: unknown[];
  finishReason?: string;
}

export interface AiSdkEvalStepTrace {
  index: number;
  stepType?: string;
  text?: string;
  finishReason?: string;
  rawFinishReason?: unknown;
  toolCalls: AiSdkEvalToolCall[];
  toolResults: AiSdkEvalToolResult[];
  usage?: AiSdkEvalUsage;
  warnings?: unknown[];
  providerMetadata?: unknown;
  request?: { body?: unknown };
  response?: {
    id?: string;
    modelId?: string;
    timestamp?: string;
    body?: unknown;
    messages?: unknown[];
  };
  timing?: AiSdkEvalTiming;
}

export interface AiSdkEvalToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface AiSdkEvalToolResult {
  toolCallId: string;
  toolName: string;
  output: unknown;
  isError?: boolean;
}

export interface AiSdkEvalUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface AiSdkEvalTiming {
  durationMs: number;
  firstTokenMs?: number | null;
  maxStepMs?: number | null;
}

export interface AiSdkEvalDiagnostics {
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
  timeout: boolean;
  stepCount: number;
  toolCallCount: number;
  toolResultCount: number;
}

export interface ToolSnapshot {
  toolName: string;
  description?: string;
  inputSchema?: unknown;
  schemaHash?: string;
}

export interface Evaluator {
  key: string;
  evaluate(input: EvaluatorInput): Promise<EvaluatorResult> | EvaluatorResult;
}

export interface EvaluatorInput {
  scenario: EvalScenario;
  agentKey: string;
  traces: AiSdkEvalTrace[];
  expectation: EvalExpectation;
  schemas?: Record<string, z.ZodType<unknown>>;
  pricing?: Record<string, ModelPrice>;
}

export interface EvaluatorResult {
  expectationId: string;
  status: EvaluatorStatus;
  score?: number;
  findings: EvalFinding[];
  metrics?: Record<string, number | string | boolean | null>;
}

export interface EvalFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  details?: string;
  evidencePath: string;
  recommendation?: string;
}

export interface AgentEvalAudit {
  schemaVersion: 'agent-eval-audit.v1';
  evalRun: {
    runId: string;
    runName?: string;
    createdAt: string;
    completedAt: string;
    status: AgentEvalRunStatus;
    decision: AgentEvalDecision;
    mode: AgentEvalMode;
  };
  agents: Record<string, AgentAuditSummary>;
  scenarioOrder: string[];
  scenarios: Record<string, ScenarioAuditResult>;
  findingOrder: string[];
  findings: Record<string, EvalFinding>;
  metrics: EvalRunMetrics;
  baseline?: BaselineComparison;
}

export interface AgentAuditSummary {
  key: string;
  name: string;
  modelIds: string[];
  scenarioCount: number;
  passedScenarioCount: number;
  failedScenarioCount: number;
  needsReviewScenarioCount: number;
  totalTokens: number;
  totalCost?: number | null;
  maxLatencyMs: number;
  avgLatencyMs: number | null;
}

export interface ScenarioAuditResult {
  id: string;
  title: string;
  kind: string;
  status: EvalStatus;
  agentResults: Record<string, AgentScenarioResult>;
}

export interface AgentScenarioResult {
  agentKey: string;
  tracePaths: string[];
  evaluatorResults: EvaluatorResult[];
  summary: {
    status: EvalStatus;
    stepCount: number;
    toolCallCount: number;
    durationMs: number;
    totalTokens: number;
  };
}

export interface EvalRunMetrics {
  scenarioCount: number;
  passedScenarioCount: number;
  failedScenarioCount: number;
  needsReviewScenarioCount: number;
  expectationCount: number;
  passedExpectationCount: number;
  failedExpectationCount: number;
  warningExpectationCount: number;
  needsReviewExpectationCount: number;
  passRate: number;
  score: number;
  scorePercent: number;
  maxScore: number;
  earnedScore: number;
  totalTokens: number;
  maxLatencyMs: number;
  avgLatencyMs: number | null;
  totalCost?: number | null;
}

export interface BaselineComparison {
  baselineRunId: string;
  candidateRunId: string;
  status: 'improved' | 'regressed' | 'mixed' | 'unchanged';
  regressions: BaselineFinding[];
  improvements: BaselineFinding[];
  metricDeltas: Record<string, number>;
}

export interface BaselineFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  details?: string;
}

export interface ModelPrice {
  currency: string;
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  source?: string;
}

export interface Redactor {
  redactTrace(trace: AiSdkEvalTrace): AiSdkEvalTrace;
  redactFinding?(finding: EvalFinding): EvalFinding;
}

export interface ArtifactWriteResult {
  auditPath: string;
  reviewPath: string;
  summaryPath: string;
  tracePaths: Record<string, string[]>;
}
