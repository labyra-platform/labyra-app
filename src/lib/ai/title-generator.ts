/**
 * Generate a conversation title using Haiku 4.5 via provider abstraction.
 * Fallback to first 6 words on error.
 * @phase R160-ai-3a
 */
import { getHaikuDispatcher } from '@/lib/ai/providers';

const TITLE_SYSTEM = `Generate a concise 3-7 word title for a chat conversation
based on the user's first message. The title should describe the topic, not the
question form. Output ONLY the title, no quotes, no punctuation at the end.

Examples:
- User: "Bandgap của WO₃ là bao nhiêu?" → "Bandgap WO₃"
- User: "Tính Tauc plot cho UV-Vis spectrum của tôi" → "Tauc plot UV-Vis"
- User: "How to fit Nyquist plot for EIS data" → "EIS Nyquist fitting"`;

export async function generateConversationTitle(firstUserMessage: string): Promise<string> {
  try {
    const { provider, config } = getHaikuDispatcher();
    const { text } = await provider.complete({
      model: config.model,
      maxTokens: 30,
      system: [{ text: TITLE_SYSTEM, cache: true, cacheTtl: '1h' }],
      messages: [{ role: 'user', content: firstUserMessage }]
    });
    return text.trim().slice(0, 80) || fallbackTitle(firstUserMessage);
  } catch {
    return fallbackTitle(firstUserMessage);
  }
}

function fallbackTitle(message: string): string {
  return message.trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 80);
}
