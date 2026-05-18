/**
 * Tool registry — single source of truth for available tools.
 * Server-only (handlers use Admin SDK).
 * @phase R160-ai-3c1
 */
import { countExperiments, findSample, recentMaterials } from './lab-tools';
import { paperTools } from './paper-tools';
import type { RegisteredTool, ToolDefinition } from './types';

/** All tools available to LLMs */
export const ALL_TOOLS: RegisteredTool[] = [
  countExperiments,
  findSample,
  recentMaterials,
  ...paperTools
];

const TOOLS_BY_NAME = new Map<string, RegisteredTool>(ALL_TOOLS.map((t) => [t.name, t]));

/** Lookup tool handler by name */
export function getTool(name: string): RegisteredTool | undefined {
  return TOOLS_BY_NAME.get(name);
}

/** Get LLM-facing tool definitions (without handlers) */
export function getToolDefinitions(): ToolDefinition[] {
  return ALL_TOOLS.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters
  }));
}
