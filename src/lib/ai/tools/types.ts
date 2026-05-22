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
  /** ADR-034 TEAM-5: viewer's group (single per user), null if none. */
  viewerGroupId?: string | null;
  /** admin/superadmin → cross-group RAG visibility (no group filter). */
  isPrivileged?: boolean;
  /**
   * R178-2a: optional list of paper IDs to scope RAG retrieval.
   * When empty/undefined → search all tenant papers (default behavior).
   * When non-empty → searchPapers tool adds Pinecone filter
   * `{ paperId: { $in: [...] } }` to constrain chunks.
   */
  selectedPaperIds?: string[];
  /**
   * R178-3: optional domain slugs to scope retrieval.
   * When empty/undefined → no domain filter.
   * When non-empty → searchPapers adds Pinecone filter
   * `{ domain: { $in: [...] } }` (OR with paperId filter).
   * @r178-3-applied
   */
  selectedDomains?: string[];
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
