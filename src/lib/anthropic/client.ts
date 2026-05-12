/**
 * Anthropic SDK singleton. Server-only — never import in client components.
 * @phase R160-ai-1
 */
import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    throw new Error(
      'ANTHROPIC_API_KEY missing or malformed. Set in .env.local (get from https://console.anthropic.com)'
    );
  }

  _client = new Anthropic({ apiKey });
  return _client;
}

// Model strings for each tier — see docs/ai/AI_ARCHITECTURE.md Section 2
export const MODELS = {
  tier1Dispatcher: 'claude-haiku-4-5-20251001', // intent classification only
  tier2: 'claude-sonnet-4-6', // default chat + spectrum analysis
  tier3: 'claude-opus-4-7' // research synthesis (NO_SAMPLING_PARAMS)
} as const;
