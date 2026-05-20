#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { loadAgentEvalConfig } from '../config.js';
import { compareAuditFiles } from '../core/baseline-comparator.js';
import { parseJsonObject, stableJson } from '../core/json.js';
import { renderAgentEvalReview } from '../core/review.js';
import { loadScenarios } from '../core/scenario-loader.js';
import { runAgentEval } from '../core/eval-runner.js';
import type { AgentEvalAudit, AgentEvalMode, ExecutionMode, HistoryMode } from '../core/types.js';

const program = new Command();

program
  .name('agent-eval')
  .description('AI SDK-first agent evaluation CLI.')
  .version('0.1.0');

program
  .command('run')
  .description('Run scenarios against AI SDK agents and write eval artifacts.')
  .requiredOption('-c, --config <path>', 'TypeScript or JavaScript config file')
  .requiredOption('-s, --scenarios <path>', 'Scenario JSON file or directory')
  .requiredOption('-o, --output-dir <path>', 'Artifact output directory')
  .option('--scenario-id <id>', 'Run one scenario')
  .option('--agent-key <key>', 'Run one agent')
  .option('--baseline <path>', 'Compare against a baseline audit after running')
  .option('--debug', 'Include debug trace data')
  .option('--json', 'Print machine-readable summary')
  .option('--concurrency <number>', 'Scenario concurrency', parseInteger)
  .option('--timeout-ms <number>', 'Default total timeout per turn', parseInteger)
  .option('--execution-mode <mode>', 'Execution mode: generate or stream', 'generate')
  .option('--history-mode <mode>', 'History mode: ai_sdk_response_messages, final_text_only, or custom', 'ai_sdk_response_messages')
  .action(async (options) => {
    const config = await loadAgentEvalConfig(resolve(options.config));
    const scenarios = await loadScenarios(resolve(options.scenarios));
    const result = await runAgentEval({
      ...config,
      scenarios: config.scenarios ?? scenarios,
      outputDir: resolve(options.outputDir),
      baselineAuditPath: options.baseline ? resolve(options.baseline) : undefined,
      mode: options.debug ? 'debug' : 'standard' as AgentEvalMode,
      includeRawAiSdkResult: Boolean(options.debug),
      concurrency: options.concurrency,
      timeoutMs: options.timeoutMs,
      executionMode: options.executionMode as ExecutionMode,
      historyMode: options.historyMode as HistoryMode,
      scenarioId: options.scenarioId,
      agentKey: options.agentKey,
    });

    if (options.json) {
      process.stdout.write(`${stableJson(result.summary)}\n`);
    } else {
      process.stdout.write(`Decision: ${result.summary.decision}\nAudit: ${result.summary.auditPath}\nReview: ${result.summary.reviewPath}\n`);
    }

    if (result.summary.decision === 'blocked') {
      process.exitCode = 1;
    }
  });

program
  .command('compare')
  .description('Compare a candidate audit against a baseline audit.')
  .requiredOption('--baseline <path>', 'Baseline audit.json')
  .requiredOption('--candidate <path>', 'Candidate audit.json')
  .option('--json', 'Print machine-readable comparison')
  .action(async (options) => {
    const comparison = await compareAuditFiles({
      baselinePath: resolve(options.baseline),
      candidatePath: resolve(options.candidate),
    });

    if (options.json) {
      process.stdout.write(`${stableJson(comparison)}\n`);
    } else {
      process.stdout.write(`Baseline comparison: ${comparison.status}\nRegressions: ${comparison.regressions.length}\nImprovements: ${comparison.improvements.length}\n`);
    }

    if (comparison.status === 'regressed' || comparison.status === 'mixed') {
      process.exitCode = 1;
    }
  });

program
  .command('review')
  .description('Render review markdown from an audit.')
  .requiredOption('--audit <path>', 'audit.json path')
  .option('--json', 'Print the parsed audit instead of markdown')
  .action(async (options) => {
    const audit = parseJsonObject(await readFile(resolve(options.audit), 'utf8'), options.audit) as AgentEvalAudit;
    process.stdout.write(options.json ? `${stableJson(audit)}\n` : renderAgentEvalReview(audit));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected integer but received ${value}`);
  }
  return parsed;
}
