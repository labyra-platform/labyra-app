/**
 * Load and rebuild conversation history for multi-turn AI calls.
 * Reconstructs tool_use + tool_result pairs from stored Firestore messages.
 * @phase R160-ai-5e-1c
 */
import 'server-only';
import type { LLMMessage } from '@/lib/ai/providers/types';
// R176-3c-thoughtsignature-persistence
import { getAdminFirestoreService } from '@/lib/firebase/admin';

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    result?: unknown;
    isError?: boolean;
    thoughtSignature?: string; // R176-3c: Gemini 3 multi-turn signature
  }>;
  createdAt: { toMillis: () => number } | number;
}

const HISTORY_MAX_MESSAGES = 20; // last 20 messages = ~10 turns
const HISTORY_MAX_CHARS = 240_000; // ~60K tokens — M8 budget cap

/**
 * Load past messages and rebuild as proper Anthropic message array.
 * Returns array suitable for use as conversationMessages prefix
 * (does NOT include the current pending user message).
 */
export async function loadConversationHistory(
  tenantId: string,
  conversationId: string,
  excludeMessageId?: string
): Promise<LLMMessage[]> {
  const db = getAdminFirestoreService();
  const snap = await db
    .collection(`tenants/${tenantId}/aiConversations/${conversationId}/messages`)
    .orderBy('createdAt', 'asc')
    .get();

  if (snap.empty) return [];

  // Collect stored messages, skip the current pending one if specified
  const stored: StoredMessage[] = [];
  for (const doc of snap.docs) {
    if (excludeMessageId && doc.id === excludeMessageId) continue;
    const data = doc.data() as StoredMessage;
    stored.push(data);
  }

  // Take last N — M8: also enforce char budget
  const recent = stored.slice(-HISTORY_MAX_MESSAGES);
  let charCount = 0;
  const budgeted: StoredMessage[] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const msgChars = (recent[i].content ?? '').length;
    if (charCount + msgChars > HISTORY_MAX_CHARS) break;
    budgeted.unshift(recent[i]);
    charCount += msgChars;
  }
  let capped = budgeted;

  // AI-PERF-8 / R245 (failure mode 3): a user turn with empty or whitespace-only
  // content is rejected by Anthropic ("text content blocks must contain non-empty
  // text") → 400 → ~500ms retry. Drop such turns up front. Crucially this runs
  // BEFORE the leading-assistant trim below: removing an empty leading user could
  // otherwise expose a leading assistant and slip an assistant-first history
  // through. Any consecutive same-role turns this leaves are fine — the existing
  // tool_result-then-next-user-query path already emits consecutive user turns.
  capped = capped.filter((m) => m.role !== 'user' || (m.content ?? '').trim().length > 0);

  // AI-2 fix (failure mode 1): char-budget truncation walks from the end, so the
  // oldest retained message can be an assistant turn. Anthropic rejects a history
  // that starts with role:'assistant' (400 "first message must use the user role").
  // Drop any leading assistant messages — the current user query is appended later.
  while (capped.length > 0 && capped[0].role === 'assistant') {
    capped = capped.slice(1);
  }

  // Rebuild as LLMMessage array
  const messages: LLMMessage[] = [];
  for (const m of capped) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      // AI-2 fix (failure mode 2): only reconstruct tool_use/tool_result pairs for
      // tool calls that actually completed (result defined). An incomplete write or
      // mid-pipeline crash can leave toolCalls with undefined result; emitting a
      // tool_use with no valid paired tool_result → Anthropic 400 INVALID_ARGUMENT.
      const completedCalls = (m.toolCalls ?? []).filter((tc) => tc.result !== undefined);
      // Assistant message reconstruction
      if (completedCalls.length > 0) {
        // Has tools — need [text, tool_use blocks] then a user [tool_result] turn
        type AssistantBlock =
          | { type: 'text'; text: string }
          | {
              type: 'tool_use';
              id: string;
              name: string;
              input: Record<string, unknown>;
              thoughtSignature?: string; // R176-3c
            };
        const assistantBlocks: AssistantBlock[] = [];
        if (m.content && m.content.trim().length > 0) {
          assistantBlocks.push({ type: 'text', text: m.content });
        }
        for (const tc of completedCalls) {
          assistantBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input,
            // R176-3c: restore signature on reload so Gemini 3 accepts the
            // following functionResponse (conditional spread — no undefined).
            ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {})
          });
        }
        const toolResultBlocks = completedCalls.map((tc) => ({
          type: 'tool_result' as const,
          tool_use_id: tc.id,
          content:
            typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result ?? { hits: [] }),
          is_error: tc.isError ?? false
        }));
        messages.push({
          role: 'assistant',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: assistantBlocks as any
        });
        messages.push({
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: toolResultBlocks as any
        });
      } else if (m.content && m.content.trim().length > 0) {
        // Plain text assistant message (or one whose tool calls never completed).
        messages.push({ role: 'assistant', content: m.content });
      }
      // else: assistant turn with neither text nor completed tools → skip entirely.
    }
  }

  return messages;
}
