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

import type { AiTier, AiCostBreakdown } from '@/types/ai';

/** Standard chat message shape, provider-agnostic */
export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Static block in system prompt that can be cached */
export interface LLMSystemBlock {
  text: string;
  cache?: boolean;
  cacheTtl?: '5m' | '1h';
}

/** Stream event emitted by every provider */
export type LLMStreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'message_complete'; usage: AiCostBreakdown }
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
