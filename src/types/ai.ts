/**
 * AI types for Labyra chat + provenance.
 * Inherited concepts from labbook-bku AI_ARCHITECTURE Section 8.
 * @phase R160-ai-1
 */

/** LLM tier — see docs/ai/AI_ARCHITECTURE.md Section 2 */
export type AiTier = 1 | 2 | 3;

/** Single message in a chat thread */
export interface GroundingDetails {
  unverifiedNumbers: number;
  unsourcedClaims: number;
  details: {
    numbers: Array<{ value: number; raw: string; context: string }>;
    claims: Array<{ sentence: string; reason: string; line: number }>;
  };
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number; // epoch ms
  /** Tier used for assistant message (R160-ai-3b). undefined for user messages. */
  tier?: 1 | 2 | 3;
  /** Tool calls made during this assistant message (R160-ai-3c1) */
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    result?: unknown;
    isError?: boolean;
  }>;
  /** Reflection iterations for T3 messages (R160-ai-4) */
  /** Grounding warnings (R160-ai-5e-1) */
  grounding?: GroundingDetails;
  reflectionHistory?: Array<{
    round: number;
    response: string;
    critique: { sufficient: boolean; issues: string[]; summary: string };
  }>;
}

/** Cost breakdown — tracks cache hits separately (Anthropic prompt caching) */
export interface AiCostBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
}

/** Audit record per AI response. Written to /tenants/{id}/aiProvenance/{messageId} */
export interface AiProvenance {
  tenantId: string;
  userId: string;
  userEmail: string;
  conversationId: string;
  messageId: string;
  tier: AiTier;
  model: string;
  provider: 'anthropic-direct' | 'aws-bedrock' | 'gcp-vertex';
  region: string;
  toolsCalled: ToolCall[];
  ragChunksUsed: RagChunkRef[];
  reflectionIterations: number;
  cost: AiCostBreakdown;
  latencyMs: number;
  timestamp: number; // epoch ms
  /** Intent classifier decision that picked this tier (R160-ai-3b) */
  intentDecision?: {
    reason: string;
    confidence: number;
    classifierCostUsd: number;
    classifierLatencyMs: number;
  };
}

export interface ToolCall {
  name: string;
  inputJson: string;
  outputJson?: string;
  durationMs?: number;
}

export interface RagChunkRef {
  paperId: string;
  chunkId: string;
  rerankScore: number;
}

/** Request body sent from client to /api/chat */
export interface ChatRequestBody {
  message: string;
  conversationId?: string;
}

/** Server-sent event payload — discriminated union over `type` */
export type ChatStreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'message_start'; messageId: string }
  | { type: 'message_complete'; usage: AiCostBreakdown }
  | { type: 'error'; message: string };

/** Conversation metadata. Stored at /tenants/{tid}/aiConversations/{cid} */
export interface AiConversation {
  id: string;
  title: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  /** Total cost across all assistant messages in this conversation */
  totalCost: AiCostBreakdown;
}

/** Updated chat request — conversationId optional (auto-create if missing) */
export interface ChatRequestBodyV2 {
  message: string;
  conversationId?: string;
}

/** Server-sent event payload v2 — adds conversationId for client to track */
export type ChatStreamEventV2 =
  | { type: 'conversation_init'; conversationId: string; isNew: boolean }
  | { type: 'message_start'; messageId: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: 'reflection_start'; round: number }
  | {
      type: 'reflection_round_complete';
      round: number;
      response: string;
      critique: { sufficient: boolean; issues: string[]; summary: string };
    }
  | {
      type: 'grounding';
      unverifiedNumbers: number;
      unsourcedClaims: number;
      details: {
        numbers: Array<{ value: number; raw: string; context: string }>;
        claims: Array<{ sentence: string; reason: string; line: number }>;
      };
    }
  | { type: 'message_complete'; usage: AiCostBreakdown; messageId: string }
  | { type: 'title_update'; conversationId: string; title: string }
  | { type: 'error'; message: string };
