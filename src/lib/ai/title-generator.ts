/**
 * Generate a conversation title from the first user message using Haiku 4.5.
 * Cost: ~$0.0001 per call. Non-blocking — called after streaming completes.
 * Fallback to first 6 words on error.
 * @phase R160-ai-2a
 */
import { getAnthropicClient, MODELS } from '@/lib/anthropic/client';

const TITLE_SYSTEM = `Generate a concise 3-7 word title for a chat conversation
based on the user's first message. The title should describe the topic, not the
question form. Output ONLY the title, no quotes, no punctuation at the end.

Examples:
- User: "Bandgap của WO₃ là bao nhiêu?" → "Bandgap WO₃"
- User: "Tính Tauc plot cho UV-Vis spectrum của tôi" → "Tauc plot UV-Vis"
- User: "How to fit Nyquist plot for EIS data" → "EIS Nyquist fitting"`;

export async function generateConversationTitle(firstUserMessage: string): Promise<string> {
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODELS.tier1Dispatcher, // Haiku 4.5
      max_tokens: 30,
      system: [
        {
          type: 'text',
          text: TITLE_SYSTEM,
          cache_control: { type: 'ephemeral', ttl: '1h' }
        }
      ],
      messages: [{ role: 'user', content: firstUserMessage }]
    });
    const block = response.content[0];
    if (block.type === 'text') {
      return block.text.trim().slice(0, 80);
    }
    throw new Error('unexpected_response_type');
  } catch {
    return fallbackTitle(firstUserMessage);
  }
}

function fallbackTitle(message: string): string {
  return message.trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 80);
}
