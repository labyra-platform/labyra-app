/**
 * Tool dispatcher — server-side execution.
 * @phase R160-ai-3c1
 */
import { getTool } from './registry';
import type { ToolCall, ToolContext, ToolResult } from './types';

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
  // AI-11: executeToolCall catches its own errors, but a rejection escaping it
  // (e.g. a synchronous throw before the try, or an unhandled async path) would
  // make Promise.all reject and kill every parallel tool. allSettled isolates
  // each call so one failure can't take down the batch.
  const settled = await Promise.allSettled(calls.map((c) => executeToolCall(c, context)));
  return settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    const msg = s.reason instanceof Error ? s.reason.message : 'tool_dispatch_error';
    console.error(`[tool ${calls[i].name}] rejected:`, s.reason);
    return {
      toolCallId: calls[i].id,
      toolName: calls[i].name,
      result: { error: msg },
      isError: true
    };
  });
}
