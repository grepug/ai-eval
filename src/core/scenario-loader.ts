import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { z } from 'zod';
import { parseJsonObject } from './json.js';
import type { EvalScenario } from './types.js';

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const expectationSchema = z.object({
  id: z.string().min(1),
  evaluator: z.string().min(1),
  severity: z.enum(['blocker', 'major', 'minor', 'info']),
  config: z.unknown().optional(),
});

const turnSchema = z.object({
  user: z.string().min(1),
  contextMessages: z.array(messageSchema).optional(),
  expectedState: z.unknown().optional(),
});

export const evalScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(['single_turn', 'multi_turn', 'tool_loop', 'structured_output', 'safety', 'regression']),
  tags: z.array(z.string()).optional(),
  turns: z.array(turnSchema).min(1),
  expectations: z.array(expectationSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const scenarioArraySchema = z.array(evalScenarioSchema);

export async function loadScenarios(inputPath: string): Promise<EvalScenario[]> {
  const pathStat = await stat(inputPath);

  if (pathStat.isDirectory()) {
    const entries = await readdir(inputPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && extname(entry.name) === '.json')
      .map((entry) => join(inputPath, entry.name))
      .sort();
    const nested = await Promise.all(files.map((file) => loadScenarioFile(file)));
    return nested.flat();
  }

  return loadScenarioFile(inputPath);
}

export async function loadScenarioFile(filePath: string): Promise<EvalScenario[]> {
  const raw = parseJsonObject(await readFile(filePath, 'utf8'), filePath);
  const parsed = Array.isArray(raw)
    ? scenarioArraySchema.safeParse(raw)
    : evalScenarioSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(`Invalid scenario fixture ${filePath}: ${z.prettifyError(parsed.error)}`);
  }

  return Array.isArray(parsed.data) ? parsed.data : [parsed.data];
}

export function validateScenarios(scenarios: EvalScenario[]): EvalScenario[] {
  const seen = new Set<string>();

  return scenarios.map((scenario, index) => {
    const parsed = evalScenarioSchema.safeParse(scenario);
    if (!parsed.success) {
      throw new Error(`Invalid scenario at index ${index}: ${z.prettifyError(parsed.error)}`);
    }
    if (seen.has(parsed.data.id)) {
      throw new Error(`Duplicate scenario id: ${parsed.data.id}`);
    }
    seen.add(parsed.data.id);
    return parsed.data;
  });
}
