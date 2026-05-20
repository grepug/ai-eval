import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { safePathSegment } from './ids.js';
import { stableJson } from './json.js';
import { renderAgentEvalReview } from './review.js';
import type { AgentEvalAudit, AgentEvalSummary, AiSdkEvalTrace, ArtifactWriteResult } from './types.js';

export async function writeArtifacts(input: {
  outputDir: string;
  audit: AgentEvalAudit;
  tracesByScenarioAgent: Record<string, AiSdkEvalTrace[]>;
}): Promise<ArtifactWriteResult> {
  await mkdir(input.outputDir, { recursive: true });
  const tracePaths: Record<string, string[]> = {};

  for (const [key, traces] of Object.entries(input.tracesByScenarioAgent)) {
    tracePaths[key] = [];
    for (const trace of traces) {
      const relativeTracePath = join(
        'traces',
        safePathSegment(trace.scenarioId),
        `${safePathSegment(trace.agentKey)}.turn-${trace.turnIndex + 1}.json`,
      );
      const absoluteTracePath = join(input.outputDir, relativeTracePath);
      await mkdir(dirname(absoluteTracePath), { recursive: true });
      await writeFile(absoluteTracePath, stableJson(trace));
      tracePaths[key].push(relativeTracePath);
    }
  }

  const reviewMarkdown = renderAgentEvalReview(input.audit);
  const auditPath = join(input.outputDir, 'audit.json');
  const reviewPath = join(input.outputDir, 'review.md');
  const summaryPath = join(input.outputDir, 'summary.json');
  const summary: AgentEvalSummary = {
    runId: input.audit.evalRun.runId,
    decision: input.audit.evalRun.decision,
    status: input.audit.evalRun.status,
    auditPath: relative(input.outputDir, auditPath),
    reviewPath: relative(input.outputDir, reviewPath),
    summaryPath: relative(input.outputDir, summaryPath),
  };

  await writeFile(auditPath, stableJson(input.audit));
  await writeFile(reviewPath, reviewMarkdown);
  await writeFile(summaryPath, stableJson(summary));

  return {
    auditPath,
    reviewPath,
    summaryPath,
    tracePaths,
  };
}
