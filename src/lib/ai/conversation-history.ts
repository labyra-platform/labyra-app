/**
 * Load and rebuild conversation history for multi-turn AI calls.
 * Reconstructs tool_use + tool_result pairs from stored Firestore messages.
 * @phase R160-ai-5e-1c
 */
import 'server-only';
import type { LLMMessage } from '@/lib/ai/providers/types';
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
  const capped = budgeted;

  // Rebuild as LLMMessage array
  const messages: LLMMessage[] = [];
  for (const m of capped) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      // Assistant message reconstruction
      if (m.toolCalls && m.toolCalls.length > 0) {
        // Has tools — need [text, tool_use blocks] then a user [tool_result] turn
        type AssistantBlock =
          | { type: 'text'; text: string }
          | {
              type: 'tool_use';
              id: string;
              name: string;
              input: Record<string, unknown>;
            };
        const assistantBlocks: AssistantBlock[] = [];
        if (m.content && m.content.trim().length > 0) {
          assistantBlocks.push({ type: 'text', text: m.content });
        }
        for (const tc of m.toolCalls) {
          assistantBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input
          });
        }
        const toolResultBlocks = m.toolCalls.map((tc) => ({
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
      } else {
        // Plain text assistant message
        messages.push({ role: 'assistant', content: m.content });
      }
    }
  }

  return messages;
}
