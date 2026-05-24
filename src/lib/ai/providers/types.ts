/**
 * LLMProvider abstraction — common interface over Anthropic, Gemini, future providers.
 *
 * Design goals:
 *   - Streaming-first (every provider must support text streaming via SSE-like events)
 *   - Cost tracking uniformly (token counts + USD)
 *   - Prompt caching aware (Anthropic ephemeral, Gemini context cache, etc.)
 *   - Type-safe model selection per tier
 *
 * @phase R160-ai-3a
 */

import type { AiCostBreakdown, AiTier } from '@/types/ai';

/**
 * Content block (ADR-036 R200): multimodal message content.
 * `text` = plain text segment. `image` = inline image for vision models.
 * tool_use / tool_result blocks are handled provider-side (LabyraBlock) and
 * not part of this user-facing union.
 */
export type LLMContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      /** MIME type e.g. 'image/png', 'image/jpeg', 'image/webp', 'image/gif' */
      mimeType: string;
      /** Base64-encoded image bytes (no data: prefix) */
      data: string;
    };

/** Standard chat message shape, provider-agnostic */
export interface LLMMessage {
  role: 'user' | 'assistant';
  /**
   * string for plain text (legacy + common case), or block array for
   * multimodal turns (text + image). Providers map blocks to their native
   * format (Gemini parts / Anthropic content blocks).
   */
  content: string | LLMContentBlock[];
}

/** Static block in system prompt that can be cached */
export interface LLMSystemBlock {
  text: string;
  cache?: boolean;
  cacheTtl?: '5m' | '1h';
}

/** Tool definition passed to provider */
export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Tool call emitted by LLM in stream */
export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** R176-2bc-thought-signature: Gemini 3 thoughtSignature for multi-turn function calls.
   *  Required by Gemini API when sending functionResponse back.
   *  Anthropic providers leave undefined. */
  thoughtSignature?: string;
}

/** Tool result passed back in followup messages */
// R176-3d-functionresponse-name
export interface LLMToolResult {
  toolCallId: string;
  // R176-3d: function name (e.g. "searchPapers") for Gemini functionResponse.name.
  // Anthropic uses toolCallId back-ref; Gemini needs the function name per spec.
  toolName?: string;
  result: unknown;
  isError?: boolean;
}

/** Stream event emitted by every provider */
export type LLMStreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_use'; toolCall: LLMToolCall }
  | {
      type: 'message_complete';
      usage: AiCostBreakdown;
      stopReason?: 'end_turn' | 'tool_use' | 'max_tokens';
    }
  | { type: 'error'; message: string };

/** Provider identifier for provenance + routing */
export type LLMProviderId = 'anthropic' | 'gemini';

/** Request shape passed to provider.streamChat() */
export interface LLMStreamRequest {
  /** Model string — provider-specific (caller passes correct one per tier) */
  model: string;
  /** Cacheable system blocks. Order matters for cache breakpoints. */
  system: LLMSystemBlock[];
  /** Conversation history including latest user message */
  messages: LLMMessage[];
  /** Max output tokens */
  maxTokens?: number;
  /** Temperature (0.0-1.0). Some models (Opus extended thinking) ignore this. */
  temperature?: number;
  /** Tools available for the LLM to call */
  tools?: LLMToolDefinition[];
  /** Tool results from previous turn (for multi-turn tool conversations) */
  // R176-3d-fix2: use LLMToolResult (was inline dup) so toolName is available
  toolResults?: LLMToolResult[];
}

/** Provider interface — every LLM backend implements this */
export interface LLMProvider {
  readonly id: LLMProviderId;
  readonly region: string;

  /**
   * Stream a chat completion. Yields events asynchronously.
   * Caller is responsible for closing the iterable on disconnect.
   */
  streamChat(request: LLMStreamRequest): AsyncIterable<LLMStreamEvent>;

  /**
   * Non-streaming completion. Useful for short calls (title generation,
   * intent classification) where streaming overhead isn't worth it.
   */
  complete(request: LLMStreamRequest): Promise<{
    text: string;
    usage: AiCostBreakdown;
  }>;
}

/** Provider registry entry */
export interface LLMProviderConfig {
  id: LLMProviderId;
  tier: AiTier;
  model: string;
  /** Display label for UI / logs */
  label: string;
}
