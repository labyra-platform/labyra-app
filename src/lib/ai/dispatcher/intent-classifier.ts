/**
 * Intent classifier — Tier 0 (Shield + Router).
 *
 * Input: user message
 * Output: tier decision + reason + confidence
 *
 * R169-2 changes:
 *   - Model: Haiku 4.5 → Gemini 3.1 Flash-Lite preview (4× cheaper).
 *   - Output tier: 1|2|3 (production tiers — T0 self, T4/T5 reserved).
 *   - Fallback tier 2 (Sonnet) unchanged.
 *
 * Strategy: Balanced (20% T1 / 60% T2 / 20% T3).
 * Default to Tier 2 (Sonnet) when uncertain or low confidence.
 *
 * @phase R160-ai-3b base, R169-2 model swap
 */
import { getHaikuDispatcher } from '@/lib/ai/providers';
import type { IntentDecision } from './types';
import type { AiTier } from '@/types/ai';
import type { FeatureKind } from '@/types/cost';

const CLASSIFIER_SYSTEM = `You are an intent classifier for a materials science lab AI.

Classify the user's message into ONE of four production tiers:

**Tier 1 (Gemini Flash-Lite — Lab Manager)** — Lab data lookups
- "How many experiments running?"
- "List my XRD equipment"
- "Tomorrow's bookings"
- Greetings, simple yes/no
- Pure data retrieval without reasoning

**Tier 2 (Sonnet 4.6 — Librarian + Engineer)** — Analysis, single-topic reasoning
- "What is bandgap of WO₃?"
- "Explain Tauc plot for indirect semiconductor"
- "Compare CV vs LSV for HER"
- Spectrum interpretation, formula derivation
- Single-paper questions
- Most technical chat (default when uncertain)

**Tier 3 (Opus 4.7 — Auditor / Multi-step Research)** — Complex synthesis
- "Summarize 5 years of WO₃ photocatalysis literature"
- "Design experiment for HER catalyst optimization"
- "Build hypothesis for why MoS₂ shows X"
- Multi-paper synthesis, multi-step planning

**Tier 4 (Sonnet 4.6 — Writer)** — Manuscript section drafting
- "Draft methods section for WO₃ hydrothermal synthesis"
- "Write the results paragraph for XRD data on Sample X"
- "Compose discussion for our photocatalysis findings"
- "Help me write the introduction for a paper on HER catalysts"
- Specifically requesting drafted text (methods/results/discussion/introduction)

DEFAULT BIAS: When uncertain, choose Tier 2 (50% of queries should be T2).
Tier 1 only for clearly simple lab data queries.
Tier 3 only for clearly complex multi-step research.
Tier 4 ONLY when user explicitly requests drafted paper section text.

Output ONLY a JSON object, no other text:
{
  "tier": 1 | 2 | 3 | 4,
  "feature": "lab_ops" | "theory" | "spectrum_analysis" | "paper_writing",
  "reason": "<10 words explaining why>",
  "confidence": <0.0 to 1.0>
}

Feature kinds:
- "lab_ops": Firestore lookup (chemicals, equipment, bookings)
- "theory": Paper RAG, mechanism explanations
- "spectrum_analysis": XRD/Raman/FTIR/UV-Vis data interpretation
- "paper_writing": Drafting Discussion/Methods/Results sections`;

interface ClassifierJsonResponse {
  tier: number;
  feature?: string;
  reason: string;
  confidence: number;
}

const CONFIDENCE_THRESHOLD = 0.7;
const FALLBACK_TIER: AiTier = 2;

/**
 * R174-hotfix7: Pre-classifier keyword override for T4 Writer.
 *
 * Gemini 2.5-flash few-shot classification unreliable for T4. Force T4 if
 * message contains strong drafting intent + section type keywords.
 */
function detectT4Override(message: string): IntentDecision | null {
  const lower = message.toLowerCase();

  // Drafting intent verbs (EN + VI)
  const draftVerbs =
    /\b(draft|write|compose|help me write|prepare|tổng hợp|viết|soạn|soạn thảo|biên soạn|dự thảo)\b/i;

  // Section type nouns (EN + VI)
  const sectionTypes =
    /\b(methods|method section|materials and methods|results|discussion|introduction|experimental section|phần (?:phương pháp|kết quả|thảo luận|giới thiệu|thực nghiệm)|methodology)\b/i;

  if (draftVerbs.test(lower) && sectionTypes.test(lower)) {
    return {
      tier: 4,
      feature: 'paper_writing',
      reason: 'keyword_override: draft+section match',
      confidence: 0.95,
      classifierCostUsd: 0,
      classifierLatencyMs: 0
    };
  }
  return null;
}

export async function classifyIntent(userMessage: string): Promise<IntentDecision> {
  const startedAt = Date.now();

  // R174-hotfix7: T4 keyword override bypasses classifier
  const t4Override = detectT4Override(userMessage);
  if (t4Override) {
    return t4Override;
  }

  try {
    const { provider, config } = getHaikuDispatcher();
    const { text, usage } = await provider.complete({
      model: config.model,
      maxTokens: 256,
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

    if (parsed.confidence < CONFIDENCE_THRESHOLD) {
      return {
        tier: FALLBACK_TIER,
        feature: defaultFeature(FALLBACK_TIER),
        reason: `low_confidence (${parsed.confidence.toFixed(2)}): ${parsed.reason}`,
        confidence: parsed.confidence,
        classifierCostUsd: usage.usd,
        classifierLatencyMs: latencyMs
      };
    }

    return {
      tier,
      feature: normalizeFeature(parsed.feature, tier),
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
    const match = cleaned.match(/\{[^}]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as ClassifierJsonResponse;
    } catch {
      return null;
    }
  }
}

/**
 * R169-2: Production tiers from intent classifier are 1|2|3.
 * Tier 0 is the classifier itself (this function).
 * Tier 4|5 are reserved for future writer/auditor flows (R170+).
 */
function normalizeTier(value: number): AiTier | null {
  if (value === 1 || value === 2 || value === 3) return value;
  return null;
}

/** R170-1: Default feature per tier when classifier doesn't specify */
function defaultFeature(tier: AiTier): FeatureKind {
  switch (tier) {
    case 0:
      return 'intent_classify';
    case 1:
      return 'lab_ops';
    case 2:
      return 'theory';
    case 3:
      return 'spectrum_analysis';
    case 4:
      return 'paper_writing';
    case 5:
      return 'audit';
  }
}

const VALID_FEATURES: readonly FeatureKind[] = [
  'chat',
  'lab_ops',
  'theory',
  'spectrum_analysis',
  'paper_writing',
  'audit',
  'title_generation',
  'intent_classify'
];

function normalizeFeature(value: unknown, tier: AiTier): FeatureKind {
  if (typeof value === 'string' && (VALID_FEATURES as readonly string[]).includes(value)) {
    return value as FeatureKind;
  }
  return defaultFeature(tier);
}

function fallback(costUsd: number, latencyMs: number, reason: string): IntentDecision {
  return {
    tier: FALLBACK_TIER,
    feature: defaultFeature(FALLBACK_TIER),
    reason: `fallback: ${reason}`,
    confidence: 0,
    classifierCostUsd: costUsd,
    classifierLatencyMs: latencyMs
  };
}
