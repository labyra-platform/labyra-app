/**
 * Tool calling types — provider-agnostic.
 * @phase R160-ai-3c1
 */

/** JSON Schema-like parameter definition */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'integer' | 'boolean' | 'array';
      description: string;
      enum?: string[];
      items?: { type: string };
    }
  >;
  required?: string[];
}

/** Tool definition registered with LLM providers */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

/** Tool call emitted by LLM */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Tool execution result returned to LLM */
export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

/** Tool execution context (server-side) */
export interface ToolContext {
  tenantId: string;
  userId: string;
}

/** Tool handler — actual execution */
export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolContext
) => Promise<unknown>;

/** Combined definition + handler for registry */
export interface RegisteredTool extends ToolDefinition {
  handler: ToolHandler;
}
