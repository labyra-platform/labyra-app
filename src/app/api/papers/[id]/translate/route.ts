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

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { estimateCost } from '@/lib/ai/cost/estimator';
import { recordCost } from '@/lib/ai/cost/telemetry';
import { checkCostGuard } from '@/lib/ai/governance/cost-guard';
import { selectProvider } from '@/lib/ai/providers';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { AiTier } from '@/types/ai';

const TIER: AiTier = 2;
const MAX_CHARS = 6000;
const MAX_IMAGE_B64 = 4_000_000; // ~3MB PNG base64 — a cropped region, not a page

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
  text?: string;
  /** Base64 PNG of a region with no text layer (figure) — OCR + translate. */
  image?: string;
  /** Stable hash of the image region (paperId+page+rect) for caching. */
  imageHash?: string;
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
  const image = body.image ?? '';
  const isImage = image.length > 0;
  const targetLang = body.targetLang ?? 'vi';
  if (!isImage && !text) return jsonError(400, 'empty_text');
  if (!isImage && text.length > MAX_CHARS) {
    return jsonError(413, 'text_too_long', { max: MAX_CHARS });
  }
  if (isImage && image.length > MAX_IMAGE_B64) {
    return jsonError(413, 'image_too_large', { max: MAX_IMAGE_B64 });
  }
  const targetName = LANG_NAME[targetLang] ?? 'Vietnamese';

  // ─── Cache lookup (tenant-scoped) ─────────────────────────────
  // Text mode: key = sha256(text + lang). Image mode: key from the client's
  // region hash (paperId+page+rect) + lang, so re-dragging the same figure hits
  // cache without re-running vision. Tenant-scoped — private uploads never leak
  // across tenants; shared within a tenant. A hit skips the model + cost guard.
  const cacheSeed = isImage ? `img\u0000${body.imageHash ?? image.slice(0, 256)}` : text;
  const hash = createHash('sha256')
    .update(`${cacheSeed}\u0000${targetLang}`)
    .digest('hex')
    .slice(0, 32);
  const db = getAdminFirestoreService();
  const cacheRef = db.doc(`tenants/${tenantId}/_translations/${hash}`);
  try {
    const snap = await cacheRef.get();
    if (snap.exists) {
      const cached = snap.data() as { translation?: string } | undefined;
      if (cached?.translation) {
        return NextResponse.json({
          paperId,
          targetLang,
          translation: cached.translation,
          cached: true
        });
      }
    }
  } catch {
    // cache read failure is non-fatal — fall through to a live translation
  }

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
Keep equations, numbers, and citation markers unchanged. Translate ONLY the prose
connecting these terms.

FORMATTING — mark up the output with these tags ONLY (no other HTML):
- <sub>…</sub> for subscripts (e.g. H<sub>2</sub>O<sub>2</sub>, IrCl<sub>3</sub>).
- <sup>…</sup> for superscripts (e.g. cm<sup>-1</sup>, O<sub>2</sub><sup>•-</sup>).
- <b>…</b> for bold and <i>…</i> for italic where the source emphasises text.
Do not use any other tags, attributes, or Markdown. Reproduce chemical formulae
with proper <sub>/<sup> so they render correctly.

Example (English→Vietnamese):
  In: "The H2O2 and IrCl3·xH2O (96.0%) were purchased from Aladdin Ltd."
  Out: "H<sub>2</sub>O<sub>2</sub> và IrCl<sub>3</sub>·xH<sub>2</sub>O (96,0%) được mua từ Aladdin Ltd."

Output ONLY the translation — no notes, no preamble, no quotes. If the text is
already in ${targetName}, return it unchanged (still apply the formatting tags).${
    isImage
      ? `

IMAGE MODE: the user's message is an image cropped from a figure. First read ALL
the text visible in it (labels, captions, axis titles, annotations) in reading
order, then translate it following every rule above. If a label is a formula or
acronym, keep it verbatim. Ignore purely graphical content with no text. If the
image contains no readable text, output exactly: [NO_TEXT]`
      : ''
  }`;

  // Message content: plain text, or the cropped image for OCR+translate.
  const userContent = isImage
    ? [
        { type: 'image' as const, mimeType: 'image/png', data: image },
        { type: 'text' as const, text: `Translate the text in this image into ${targetName}.` }
      ]
    : text;

  const started = Date.now();
  // Output can be much longer than input (Vietnamese/CJK expand; the model also
  // re-emits all the kept-verbatim formulae). Budget generously so long passages
  // aren't cut off; Flash supports large outputs and we only pay for what's used.
  const estInTokens = isImage ? 1500 : Math.ceil(text.length / 3);
  const maxTokens = Math.min(16384, Math.max(2048, estInTokens * 4 + 1024));

  // R237ag: stream the translation so the reader sees text appear within
  // ~300ms (time-to-first-token) instead of waiting for the whole passage.
  // Plain-text stream; cache hits above returned JSON, so the client tells them
  // apart by Content-Type. On completion we persist to cache + record cost.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = '';
      let truncated = false;
      try {
        for await (const event of provider.streamChat({
          model: config.model,
          maxTokens,
          temperature: 0.2,
          system: [{ text: system, cache: false }],
          messages: [{ role: 'user', content: userContent }]
        })) {
          if (event.type === 'text_delta') {
            full += event.delta;
            controller.enqueue(encoder.encode(event.delta));
          } else if (event.type === 'message_complete') {
            if (event.stopReason === 'max_tokens') truncated = true;
            void recordCost({
              tenantId,
              tier: TIER,
              capability: 'rag-balanced',
              feature: 'translate',
              costUsd: event.usage.usd,
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              latencyMs: Date.now() - started
            }).catch(() => {});
          } else if (event.type === 'error') {
            controller.error(new Error(event.message));
            return;
          }
        }
      } catch {
        controller.error(new Error('translation_failed'));
        return;
      }
      const translation = full.trim();
      // Don't cache: truncated output, or an image with no readable text. A
      // re-try then re-runs cleanly instead of replaying a bad result.
      const noText = translation === '[NO_TEXT]' || translation === '';
      if (translation && !truncated && !noText) {
        void cacheRef
          .set({ translation, targetLang, paperId, createdAt: Date.now() })
          .catch(() => {});
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Translate-Stream': '1'
    }
  });
}
