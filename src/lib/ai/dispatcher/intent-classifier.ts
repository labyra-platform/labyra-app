/**
 * Intent classifier using Haiku 4.5.
 * Input: user message
 * Output: tier decision + reason + confidence
 *
 * Strategy: Balanced (20% T1 / 60% T2 / 20% T3).
 * Default to Tier 2 (Sonnet) when uncertain.
 *
 * @phase R160-ai-3b
 */
import { getHaikuDispatcher } from '@/lib/ai/providers';
import type { IntentDecision } from './types';
import type { AiTier } from '@/types/ai';

const CLASSIFIER_SYSTEM = `You are an intent classifier for a materials science lab AI.

Classify the user's message into ONE of three tiers based on cognitive complexity required:

**Tier 1 (Gemini Flash)** — Simple lookup, lab data query, conversational
- "How many experiments are running?"
- "List my XRD equipment"
- "What's on tomorrow's booking?"
- Greetings, clarifications, simple yes/no
- Pure data retrieval without reasoning

**Tier 2 (Sonnet 4.6)** — Analysis, single-topic reasoning, technical Q&A
- "What is bandgap of WO₃?"
- "Explain Tauc plot for indirect semiconductor"
- "Compare CV vs LSV for HER characterization"
- Spectrum interpretation, formula derivation
- Single-paper questions
- Most technical chat (default tier — when in doubt, choose this)

**Tier 3 (Opus 4.7)** — Multi-step research synthesis, complex reasoning
- "Summarize 5 years of WO₃ photocatalysis literature"
- "Design experiment for HER catalyst optimization"
- "Build hypothesis for why MoS₂ shows X behavior"
- Multi-paper synthesis, multi-step planning
- Cross-disciplinary reasoning

DEFAULT BIAS: When uncertain, choose Tier 2 (60% of queries should be T2).
Tier 1 only for clearly simple lab data queries.
Tier 3 only for clearly complex multi-step research questions.

Output ONLY a JSON object, no other text:
{
  "tier": 1 | 2 | 3,
  "reason": "<10 words explaining why>",
  "confidence": <0.0 to 1.0>
}`;

interface ClassifierJsonResponse {
  tier: number;
  reason: string;
  confidence: number;
}

const CONFIDENCE_THRESHOLD = 0.7;
const FALLBACK_TIER: AiTier = 2;

export async function classifyIntent(userMessage: string): Promise<IntentDecision> {
  const startedAt = Date.now();

  try {
    const { provider, config } = getHaikuDispatcher();
    const { text, usage } = await provider.complete({
      model: config.model,
      maxTokens: 100,
      system: [{ text: CLASSIFIER_SYSTEM, cache: true, cacheTtl: '1h' }],
      messages: [{ role: 'user', content: userMessage }]
    });

    const latencyMs = Date.now() - startedAt;
    const parsed = parseClassifierResponse(text);

    if (!parsed) {
      return fallback(usage.usd, latencyMs, 'parse_failed');
    }

    const tier = normalizeTier(parsed.tier);
    if (!tier) {
      return fallback(usage.usd, latencyMs, `invalid_tier_${parsed.tier}`);
    }

    // Apply confidence threshold
    if (parsed.confidence < CONFIDENCE_THRESHOLD) {
      return {
        tier: FALLBACK_TIER,
        reason: `low_confidence (${parsed.confidence.toFixed(2)}): ${parsed.reason}`,
        confidence: parsed.confidence,
        classifierCostUsd: usage.usd,
        classifierLatencyMs: latencyMs
      };
    }

    return {
      tier,
      reason: parsed.reason,
      confidence: parsed.confidence,
      classifierCostUsd: usage.usd,
      classifierLatencyMs: latencyMs
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return fallback(0, Date.now() - startedAt, `classifier_error: ${msg}`);
  }
}

function parseClassifierResponse(text: string): ClassifierJsonResponse | null {
  // Strip code fences if present
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    if (
      typeof obj.tier === 'number' &&
      typeof obj.reason === 'string' &&
      typeof obj.confidence === 'number'
    ) {
      return obj as ClassifierJsonResponse;
    }
    return null;
  } catch {
    // Try to extract JSON from surrounding text
    const match = cleaned.match(/\{[^}]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as ClassifierJsonResponse;
    } catch {
      return null;
    }
  }
}

function normalizeTier(value: number): AiTier | null {
  if (value === 1 || value === 2 || value === 3) return value;
  return null;
}

function fallback(costUsd: number, latencyMs: number, reason: string): IntentDecision {
  return {
    tier: FALLBACK_TIER,
    reason: `fallback: ${reason}`,
    confidence: 0,
    classifierCostUsd: costUsd,
    classifierLatencyMs: latencyMs
  };
}
