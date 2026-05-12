/**
 * Tool dispatcher — server-side execution.
 * @phase R160-ai-3c1
 */
import { getTool } from './registry';
import type { ToolCall, ToolResult, ToolContext } from './types';

/** Execute a single tool call. Errors are captured as result with isError=true. */
export async function executeToolCall(call: ToolCall, context: ToolContext): Promise<ToolResult> {
  const tool = getTool(call.name);
  if (!tool) {
    return {
      toolCallId: call.id,
      toolName: call.name,
      result: { error: `unknown_tool: ${call.name}` },
      isError: true
    };
  }

  try {
    const result = await tool.handler(call.input, context);
    return {
      toolCallId: call.id,
      toolName: call.name,
      result,
      isError: false
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    console.error(`[tool ${call.name}] failed:`, err);
    return {
      toolCallId: call.id,
      toolName: call.name,
      result: { error: msg },
      isError: true
    };
  }
}

/** Execute multiple tool calls in parallel */
export async function executeToolCalls(
  calls: ToolCall[],
  context: ToolContext
): Promise<ToolResult[]> {
  return Promise.all(calls.map((c) => executeToolCall(c, context)));
}
