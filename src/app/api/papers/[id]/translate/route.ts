/**
 * POST /api/papers/[id]/translate — translate a selected passage (C5).
 *
 * Tier 2 (Gemini Flash): translation needs fluency, not reasoning, so the
 * cheapest competent tier is right. Cost-guarded + recorded under the
 * 'translate' feature. Input is the raw selected text + a target language;
 * output is the translation only (no preamble).
 *
 * The text is the user's own on-screen selection from a paper they can already
 * read, so this is not a bulk-extraction endpoint — we cap the input length.
 */

import { NextResponse } from 'next/server';
import { estimateCost } from '@/lib/ai/cost/estimator';
import { recordCost } from '@/lib/ai/cost/telemetry';
import { checkCostGuard } from '@/lib/ai/governance/cost-guard';
import { selectProvider } from '@/lib/ai/providers';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { AiTier } from '@/types/ai';

const TIER: AiTier = 2;
const MAX_CHARS = 6000;

const LANG_NAME: Record<string, string> = {
  vi: 'Vietnamese',
  en: 'English',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German'
};

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

interface TranslateBody {
  text: string;
  targetLang: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: paperId } = await params;

  // ─── Auth ─────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'missing_token');
  let decoded;
  try {
    decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return jsonError(401, 'invalid_token');
  }
  const tenantId = getTenantIdFromToken(decoded);
  if (!tenantId) return jsonError(403, 'missing_tenant_claim');

  // ─── Rate limit ───────────────────────────────────────────────
  const rl = await checkRateLimit(rateLimitKey('paper-translate', tenantId), 60, 60);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { retryAfter: rl.resetSec });

  // ─── Body ─────────────────────────────────────────────────────
  let body: TranslateBody;
  try {
    body = (await request.json()) as TranslateBody;
  } catch {
    return jsonError(400, 'invalid_json');
  }
  const text = (body.text ?? '').trim();
  const targetLang = body.targetLang ?? 'vi';
  if (!text) return jsonError(400, 'empty_text');
  if (text.length > MAX_CHARS) return jsonError(413, 'text_too_long', { max: MAX_CHARS });
  const targetName = LANG_NAME[targetLang] ?? 'Vietnamese';

  // ─── Cost guard (estimate before spending) ────────────────────
  const estimated = estimateCost(TIER, 'translate');
  const guard = await checkCostGuard(tenantId, TIER, 'translate', estimated);
  if (!guard.allowed) return jsonError(402, 'cost_guard_blocked', { reason: guard.reason });

  // ─── Translate ────────────────────────────────────────────────
  const { provider, config } = selectProvider(TIER);
  const system = `You translate scientific text into ${targetName} for an expert reader.

DO NOT TRANSLATE (keep verbatim, do not transliterate or localize):
- Chemical formulae and symbols: NaOH, IrCl₃·xH₂O, K₂TiO(C₂O₄)₂·2H₂O, H₂O₂, WO₃.
- Acronyms / abbreviations: TBA, BQ, DMPO, CB, TMB, AR, PBS, XRD, FTIR, DFT.
- Units and quantities: cm⁻¹, eV, wt%, 30 wt%, 97.0%, 10 mL, 0 °C.
- Element/compound names written as formulae stay as formulae.
Keep equations, numbers, and citation markers unchanged. Preserve subscripts/
superscripts exactly. Translate ONLY the prose connecting these terms.

Example (English→Vietnamese):
  In: "The NaOH (96.0%) and IrCl₃·xH₂O were purchased from Aladdin Ltd."
  Out: "NaOH (96,0%) và IrCl₃·xH₂O được mua từ Aladdin Ltd."
(Note: NaOH and IrCl₃·xH₂O are unchanged; only the surrounding prose is translated.)

Output ONLY the translation — no notes, no preamble, no quotes. If the text is
already in ${targetName}, return it unchanged.`;

  const started = Date.now();
  // Vietnamese/CJK output can be ~2-3x the input tokens; scale the cap to the
  // selection length so long passages aren't cut off mid-sentence.
  const estInTokens = Math.ceil(text.length / 3);
  const maxTokens = Math.min(8192, Math.max(1024, estInTokens * 3 + 512));
  let result;
  try {
    result = await provider.complete({
      model: config.model,
      maxTokens,
      temperature: 0.2,
      system: [{ text: system, cache: false }],
      messages: [{ role: 'user', content: text }]
    });
  } catch {
    return jsonError(502, 'translation_failed');
  }

  // ─── Record cost (best-effort) ────────────────────────────────
  void recordCost({
    tenantId,
    tier: TIER,
    capability: 'rag-balanced',
    feature: 'translate',
    costUsd: result.usage.usd,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    latencyMs: Date.now() - started
  }).catch(() => {});

  return NextResponse.json({
    paperId,
    targetLang,
    translation: result.text.trim()
  });
}
