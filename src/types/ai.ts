/**
 * AI types for Labyra chat + provenance.
 * Inherited concepts from labbook-bku AI_ARCHITECTURE Section 8.
 * @phase R160-ai-1
 */

/** LLM tier — see docs/ai/AI_ARCHITECTURE.md Section 2 */
export type AiTier = 1 | 2 | 3;

/** Single message in a chat thread */
export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number; // epoch ms
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
  | { type: 'message_complete'; usage: AiCostBreakdown; messageId: string }
  | { type: 'title_update'; conversationId: string; title: string }
  | { type: 'error'; message: string };
