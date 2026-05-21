/**
 * Anthropic SDK singleton. Server-only — never import in client components.
 *
 * R169-2: MODELS constant DEPRECATED. Use getModelForTier(tier) from
 * '@/lib/ai/config/capabilities' instead. The const is kept temporarily
 * for any straggler caller; remove in R170.
 *
 * @phase R160-ai-1 base, R169-2 deprecation
 */
import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.startsWith('sk-ant-')) {
    throw new Error(
      'ANTHROPIC_API_KEY missing or malformed. Set in .env.local (get from https://console.anthropic.com)'
    );
  }

  _client = new Anthropic({ apiKey });
  return _client;
}
