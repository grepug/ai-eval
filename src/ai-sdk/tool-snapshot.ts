import { createHash } from 'node:crypto';
import type { ToolSnapshot } from '../core/types.js';

export function snapshotTools(agent: unknown, compact = true): ToolSnapshot[] {
  const tools = readTools(agent);
  if (!tools) {
    return [];
  }

  return Object.entries(tools)
    .map(([toolName, tool]) => {
      const record = tool && typeof tool === 'object' ? tool as Record<string, unknown> : {};
      const inputSchema = record.inputSchema ?? record.parameters;
      return {
        toolName,
        description: typeof record.description === 'string' ? record.description : undefined,
        inputSchema: compact ? undefined : inputSchema,
        schemaHash: inputSchema === undefined ? undefined : hashJson(inputSchema),
      };
    })
    .sort((left, right) => left.toolName.localeCompare(right.toolName));
}

function readTools(agent: unknown): Record<string, unknown> | null {
  if (!agent || typeof agent !== 'object') {
    return null;
  }

  const record = agent as Record<string, unknown>;
  const direct = record.tools;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  const settings = record.settings;
  if (settings && typeof settings === 'object') {
    const nested = (settings as Record<string, unknown>).tools;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }

  return null;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
