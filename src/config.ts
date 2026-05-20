import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import type { AgentEvalConfig } from './core/types.js';

export function defineAgentEvalConfig(config: AgentEvalConfig): AgentEvalConfig {
  return config;
}

export async function loadAgentEvalConfig(configPath: string): Promise<AgentEvalConfig> {
  const module = configPath.endsWith('.ts')
    ? await createJiti(import.meta.url).import(configPath)
    : await import(pathToFileURL(configPath).href);
  const config = module.default ?? module.config;

  if (!config || typeof config !== 'object') {
    throw new Error(`Config file ${configPath} must export a default config object.`);
  }

  return config as AgentEvalConfig;
}
