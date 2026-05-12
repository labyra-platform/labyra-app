/**
 * On-topic check: classify whether user query is within Labyra's domain
 * (materials science, lab management, scientific research).
 *
 * Off-topic → respond politely, don't waste tier-routing or tool calls.
 *
 * Cost: ~$0.0002/query (Haiku, 1 round, 50 tokens)
 * Latency: ~300-500ms
 * @phase R160-ai-5e-2
 */
import 'server-only';
import { getProviderById } from '@/lib/ai/providers';

export interface OnTopicResult {
  onTopic: boolean;
  category: 'materials' | 'lab' | 'general_science' | 'off_topic';
  reason: string;
  costUsd: number;
}

const SYSTEM_PROMPT = `You are a query classifier for a materials science research platform.
Classify the user's query into ONE category:

- "materials": chemistry, physics, materials properties, electrochemistry, photocatalysis, spectroscopy
- "lab": lab management (inventory, equipment, experiments, members, bookings, samples)
- "general_science": broader science (biology, medicine, math, computing) — still in-scope
- "off_topic": entertainment, news, cooking, sports, politics, personal life advice, jokes

Return ONLY valid JSON with this shape (no markdown, no commentary):
{
  "category": "materials" | "lab" | "general_science" | "off_topic",
  "reason": "<one sentence why>"
}

Bias toward "general_science" if uncertain — only "off_topic" for clearly entertainment/personal queries.`;

export async function classifyOnTopic(query: string): Promise<OnTopicResult> {
  const defaultResult: OnTopicResult = {
    onTopic: true,
    category: 'general_science',
    reason: 'classifier_skipped',
    costUsd: 0
  };

  // Skip very short queries (likely greeting)
  if (query.trim().length < 8) {
    return defaultResult;
  }

  try {
    const provider = getProviderById('anthropic');
    const result = await provider.complete({
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 100,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [{ role: 'user', content: query }]
    });

    let jsonText = result.text.trim();
    jsonText = jsonText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(jsonText) as { category: string; reason: string };
    const category = parsed.category as OnTopicResult['category'];

    return {
      onTopic: category !== 'off_topic',
      category,
      reason: parsed.reason,
      costUsd: result.usage.usd
    };
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'warn',
        event: 'on_topic_classifier_failed',
        error: err instanceof Error ? err.message : String(err)
      })
    );
    return defaultResult;
  }
}

/**
 * Standard polite refusal text for off-topic queries (Vietnamese default).
 */
export function offTopicResponse(query: string, language: 'vi' | 'en' = 'vi'): string {
  if (language === 'en') {
    return `I focus on materials science, lab management, and scientific research. Your question about "${query.slice(0, 50)}..." is outside my scope. Is there something research-related I can help with?`;
  }
  return `Tôi tập trung hỗ trợ về materials science, quản lý phòng lab, và nghiên cứu khoa học. Câu hỏi của bạn nằm ngoài phạm vi đó. Tôi có thể giúp gì khác trong lĩnh vực nghiên cứu của bạn không?`;
}
