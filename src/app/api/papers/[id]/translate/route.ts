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
import { franc } from 'franc-min';
import { NextResponse } from 'next/server';
import { estimateCost } from '@/lib/ai/cost/estimator';
import { recordCost } from '@/lib/ai/cost/telemetry';
import { checkCostGuard } from '@/lib/ai/governance/cost-guard';
import { selectProvider } from '@/lib/ai/providers';
import { protectRefs, restoreRefs } from '@/features/papers/lib/citation-protect';
import { glossaryBlock } from '@/features/papers/lib/translation-glossary';
import { tmBlock, tmRetrieve, tmStore } from '@/lib/ai/rag/translation-memory';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { AiTier } from '@/types/ai';

const TIER: AiTier = 2;
const MAX_CHARS = 12_000; // a full A4 page of dense text is ~3500 chars; this is 3x safety
const MAX_IMAGE_B64 = 6_000_000;

const LANG_NAME: Record<string, string> = {
  vi: 'Vietnamese',
  en: 'English',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German'
};

// franc-min returns ISO 639-3; map to our 2-letter target codes for the identity
// short-circuit. Only languages offered as targets need an entry.
const FRANC_TO_LANG: Record<string, string> = {
  eng: 'en',
  vie: 'vi',
  cmn: 'zh',
  jpn: 'ja',
  kor: 'ko',
  fra: 'fr',
  deu: 'de'
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
  /** R237ao: selection starts/ends mid-sentence (drag cut a sentence). The
   *  model should translate the fragment as-is, not invent a complete one. */
  partialStart?: boolean;
  partialEnd?: boolean;
  targetLang: string;
}

interface ParagraphChunk {
  text: string;
  hash: string;
  translation: string | null;
}
interface ParagraphPlan {
  chunks: ParagraphChunk[];
  separator: string;
  allHits: boolean;
}

/** Split text into translation units. We use paragraph breaks (≥1 blank line)
 *  as the boundary because a paragraph is a coherent unit the model translates
 *  well; sentence-splitting fragments scientific prose (abbreviations, decimal
 *  points). A single huge paragraph stays whole. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function chunkHash(chunkText: string, targetLang: string): string {
  return createHash('sha256').update(`${chunkText}\u0000${targetLang}`).digest('hex').slice(0, 32);
}

async function buildParagraphPlan(
  db: ReturnType<typeof getAdminFirestoreService>,
  tenantId: string,
  text: string,
  targetLang: string
): Promise<ParagraphPlan> {
  const parts = splitParagraphs(text);
  if (parts.length <= 1) {
    return { chunks: [], separator: '\n\n', allHits: false };
  }
  const chunks: ParagraphChunk[] = parts.map((p) => ({
    text: p,
    hash: chunkHash(p, targetLang),
    translation: null
  }));
  // Batch read all chunk caches in one round-trip.
  const refs = chunks.map((c) => db.doc(`tenants/${tenantId}/_translations/${c.hash}`));
  try {
    const snaps = await db.getAll(...refs);
    for (let i = 0; i < snaps.length; i++) {
      const d = snaps[i].data() as { translation?: string } | undefined;
      if (d?.translation) chunks[i].translation = d.translation;
    }
  } catch {
    // batch read failure: behave as all-miss
  }
  const allHits = chunks.every((c) => c.translation !== null);
  return { chunks, separator: '\n\n', allHits };
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
  // Three modes:
  //   - text-only: typical prose selection; cheapest.
  //   - image-only: a figure with no text layer → OCR + translate.
  //   - dual (text + image): prose selection that ALSO contains formulae the PDF
  //     text layer mangled. The image lets the model read sub/superscripts and
  //     equations the text layer can't; the text saves vision tokens for prose.
  const isDual = text.length > 0 && image.length > 0;
  const mode: 'text' | 'image' | 'dual' = isDual ? 'dual' : isImage ? 'image' : 'text';

  // ─── Identity short-circuit (§3): same-language = nothing to translate ──
  // If the selection is already in the target language, return it verbatim with
  // 0 tokens + no model call (text mode only — an image always needs OCR).
  //   Tier 2: franc-min on the selection — local, ~ms, no read. Reliable for
  //           paragraph-sized text. We short-circuit ONLY on an exact match, so
  //           a misdetection falls through to a real translation.
  //   Tier 3: when franc can't decide (very short selection), fall back to the
  //           paper's stored language (worker metadata) — further below.
  const francLang = mode === 'text' && text.length > 10 ? FRANC_TO_LANG[franc(text)] : undefined;
  if (francLang === targetLang) {
    return NextResponse.json({
      paperId,
      targetLang,
      translation: text,
      cached: false,
      identity: true
    });
  }

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

  // ─── Paragraph-level cache (text mode only) ───────────────────
  // The single-shot hash above misses if even one character of the selection
  // changes (e.g. the user drags one more line). To avoid re-translating the
  // bits we already have, split the text into paragraphs and look each up
  // individually. Hits return instantly; only the cache-miss paragraphs are
  // sent to the model. Doesn't apply to image/dual mode.
  let paragraphPlan: ParagraphPlan | null = null;
  if (mode === 'text' && text.length > 0) {
    paragraphPlan = await buildParagraphPlan(db, tenantId, text, targetLang);
    if (paragraphPlan.allHits) {
      // Every chunk was cached — assemble + return without calling the model.
      const assembled = paragraphPlan.chunks
        .map((c) => c.translation ?? '')
        .join(paragraphPlan.separator);
      // Also write the full-selection hash so the next exact-match drag is O(1).
      void cacheRef
        .set({
          translation: assembled,
          targetLang,
          paperId,
          createdAt: Date.now()
        })
        .catch(() => {});
      return NextResponse.json({ paperId, targetLang, translation: assembled, cached: true });
    }
  }

  // ─── Identity short-circuit Tier 3 (franc inconclusive) ───────
  // Very short selections defeat franc; fall back to the paper's stored language
  // (set by the worker metadata step). One read, only when franc couldn't decide
  // and we haven't already returned from cache. Catches short same-language drags.
  if (mode === 'text' && !francLang) {
    try {
      const paperSnap = await db.doc(`tenants/${tenantId}/papers/${paperId}`).get();
      const paperLang = (paperSnap.data() as { language?: string } | undefined)?.language;
      if (paperLang === targetLang) {
        return NextResponse.json({
          paperId,
          targetLang,
          translation: text,
          cached: false,
          identity: true
        });
      }
    } catch {
      // best-effort — fall through to a real translation
    }
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
- Acronyms / abbreviations: TBA, BQ, DMPO, CB, TMB, AR, PBS, XRD, FTIR, DFT, EPS.
- Units and quantities: cm⁻¹, eV, wt%, 30 wt%, 97.0%, 10 mL, 0 °C.
- Species/genus names in italics (Streptococcus mutans, S. mutans).
- Element/compound names written as formulae stay as formulae.
- Citation markers like [1], [29–31] stay unchanged.
- Placeholders of the form ⟦C0⟧, ⟦C1⟧, … are protected references — keep each one EXACTLY as written, in place; never translate, reorder, space out, or drop them.
Translate ONLY the prose connecting these terms.

FORMATTING — mark up the output with these tags ONLY (no other HTML, no Markdown):
- <sub>…</sub> subscripts: H<sub>2</sub>O<sub>2</sub>, IrCl<sub>3</sub>·xH<sub>2</sub>O.
- <sup>…</sup> superscripts: cm<sup>-1</sup>, [Ru(bpy)<sub>3</sub>]<sup>2+</sup>.
- Combined sub+sup (a radical with charge): write BOTH, e.g. ·O<sub>2</sub><sup>−</sup>, ClO<sub>4</sub><sup>−</sup>. Never lose one of them.
- <b>…</b> for bold where the source uses bold (section labels like ABSTRACT, KEYWORDS, HIGHLIGHTS; emphasised words).
- <i>…</i> for italic (species names, mathematical variables, emphasis).
- <math>…</math> wraps LaTeX for any equation, fraction, integral, or summation. Inside this tag, use standard LaTeX (\\frac, \\int, \\sum, \\sqrt, ^, _) — ASCII only. DO NOT translate equation contents. DO NOT put Vietnamese or any prose words inside <math>; it is for formulae only.

STRUCTURE — preserve the input layout:
- Keep paragraph breaks: a blank line in the input → a blank line in the output (use two newlines).
- Keep bullet/numbered lists: if a line starts with "• ", "- ", "● ", "1. ", "(a)", reproduce that exact marker at the start of the translated line.
- Keep section labels on their own line (ABSTRACT, KEYWORDS, HIGHLIGHTS, INTRODUCTION) followed by a paragraph break, and bold them: <b>ABSTRACT</b>.
- Never merge bullets into one paragraph; never drop a heading.

Example (English→Vietnamese):
  In:
    ABSTRACT
    The H2O2 (96.0%) was purchased from Aladdin Ltd. We generated ·O2- with E = mc^2.

    KEYWORDS
    ROS; Biofilm; Caries
  Out:
    <b>TÓM TẮT</b>

    H<sub>2</sub>O<sub>2</sub> (96,0%) được mua từ Aladdin Ltd. Chúng tôi đã tạo ra ·O<sub>2</sub><sup>−</sup> với <math>E = mc^2</math>.

    <b>TỪ KHOÁ</b>

    ROS; Biofilm; Caries

Output ONLY the translation — no notes, no preamble, no quotes. If the text is
already in ${targetName}, return it unchanged (still apply the formatting tags).${
    glossaryBlock(targetLang) ? `\n\n${glossaryBlock(targetLang)}` : ''
  }${
    mode === 'image'
      ? `

IMAGE MODE: the message is a cropped image with no PDF text layer. Read every
visible label/caption/axis/annotation in reading order, then translate them.
Preserve formulae and acronyms verbatim. If the image has no readable text,
output exactly: [NO_TEXT]`
      : ''
  }${
    mode === 'dual'
      ? `

DUAL MODE: you receive BOTH the PDF text and the rendered image of the same
passage. The text layer often mangles equations and subscripts; use the IMAGE
as the source of truth for any formula, equation, sub/superscript, or symbol,
and use the TEXT only for the prose. Wrap recovered equations in <math>…</math>
with LaTeX. Reproduce every chemical species (e.g. ·O<sub>2</sub><sup>−</sup>)
exactly as the image shows.`
      : ''
  }${
    body.partialStart || body.partialEnd
      ? `

PARTIAL SELECTION: this text was cut by a drag selection${
          body.partialStart && body.partialEnd
            ? ' at BOTH the start and the end'
            : body.partialStart
              ? ' at the START (it begins mid-sentence)'
              : ' at the END (it ends mid-sentence)'
        }. Translate ONLY what is given — do NOT complete the sentence, do NOT add words to make it grammatical, do NOT invent a beginning or ending. Mirror the fragment faithfully.`
      : ''
  }`;

  const userContent =
    mode === 'text'
      ? text
      : mode === 'image'
        ? [
            { type: 'image' as const, mimeType: 'image/png', data: image },
            { type: 'text' as const, text: `Translate the text in this image into ${targetName}.` }
          ]
        : [
            { type: 'image' as const, mimeType: 'image/png', data: image },
            {
              type: 'text' as const,
              text: `Translate this passage into ${targetName}. The TEXT below is from the PDF's text layer (use it for prose). The IMAGE above is the same passage as it appears on screen — use it to recover any equations, sub/superscripts, or symbols the text layer mangled. Reproduce equations in LaTeX inside <math>…</math> tags.\n\nTEXT:\n${text}`
            }
          ];

  const started = Date.now();
  // Output can be much longer than input (Vietnamese/CJK expand; the model also
  // re-emits all the kept-verbatim formulae). Budget generously so long passages
  // aren't cut off; Flash supports large outputs and we only pay for what's used.
  const estInTokens = mode === 'image' ? 2000 : Math.ceil(text.length / 3);
  const maxTokens = Math.min(32_768, Math.max(4096, estInTokens * 5 + 2048));

  // ─── Partial cache hit path (paragraph cache, text mode) ──────
  // Some paragraphs are cached; only the misses need a model call. We can't
  // stream cleanly here because we must splice the model's output back into the
  // cached chunks, so we use complete() and return the assembled JSON.
  if (paragraphPlan && !paragraphPlan.allHits) {
    const SEP = '\n<<<§§§>>>\n';
    const missChunks = paragraphPlan.chunks.filter((c) => c.translation === null);
    const missText = missChunks.map((c) => c.text).join(SEP);
    // ADR-045 Tier 1a: mask citations / cross-refs so the model can't corrupt
    // them, then restore (localizing Figure→Hình etc.) after. The SEP marker is
    // not a ref, so it survives masking untouched.
    const { masked: maskedMiss, map: refMap } = protectRefs(missText);
    // ADR-045 Tier 4: retrieve similar past translations and prepend them as
    // in-context examples so terminology stays consistent (best-effort; empty
    // on cold start). Retrieval runs on the raw (unmasked) source text.
    const tmEntries = await tmRetrieve(tenantId, missText, targetLang);
    const tmHint = tmBlock(tmEntries);
    const missPrompt = `${tmHint ? `${tmHint}\n\n` : ''}Translate the following paragraphs into ${targetName} following ALL the rules above. The paragraphs are separated by the marker "<<<§§§>>>" — keep that marker between paragraphs in your output so I can split them back. Translate each paragraph independently; do NOT merge them.\n\n${maskedMiss}`;
    let result;
    try {
      result = await provider.complete({
        model: config.model,
        maxTokens,
        temperature: 0.2,
        system: [{ text: system, cache: false }],
        messages: [{ role: 'user', content: missPrompt }]
      });
    } catch {
      return jsonError(502, 'translation_failed');
    }
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

    // Reflection pass (ADR-045 Tier 3, always-on R237bi): critique + improve the
    // draft for higher quality. Placeholders + tags are still masked here (refMap
    // not yet restored), so refs stay protected across both passes. Runs only on
    // cache misses, so a passage is 2-pass once, then served from cache. On
    // failure we keep the pass-1 draft.
    let finalMasked = result.text;
    {
      const reflectPrompt = `You are revising a ${targetName} translation of a scientific passage.

SOURCE:
${maskedMiss}

DRAFT TRANSLATION:
${result.text}

Improve the DRAFT: fix mistranslated technical terms, awkward or unnatural phrasing, and any omitted meaning, while staying faithful to the source and using standard ${targetName} scientific terminology. Keep every ⟦Cn⟧ placeholder and every <sub>/<sup>/<b>/<i>/<math> tag EXACTLY as written, and keep the "<<<§§§>>>" markers between paragraphs. Output ONLY the improved ${targetName} translation — no notes, no preamble.`;
      try {
        const r2 = await provider.complete({
          model: config.model,
          maxTokens,
          temperature: 0.3,
          system: [{ text: system, cache: false }],
          messages: [{ role: 'user', content: reflectPrompt }]
        });
        if (r2.text.trim()) finalMasked = r2.text;
        void recordCost({
          tenantId,
          tier: TIER,
          capability: 'rag-balanced',
          feature: 'translate_reflect',
          costUsd: r2.usage.usd,
          inputTokens: r2.usage.inputTokens,
          outputTokens: r2.usage.outputTokens,
          latencyMs: Date.now() - started
        }).catch(() => {});
      } catch {
        // keep pass-1 draft
      }
    }

    const restored = restoreRefs(finalMasked, refMap, targetLang);
    const translatedMisses = restored.split(/\n*<<<§§§>>>\n*/);
    // Defensive: if the model dropped the marker, fall back to a single chunk
    // covering the whole missed text — better than an alignment crash.
    const aligned: string[] =
      translatedMisses.length === missChunks.length ? translatedMisses : [restored];

    // Cache each freshly-translated chunk and splice them back in order.
    let mi = 0;
    const tmPairs: { source: string; translation: string }[] = [];
    for (const chunk of paragraphPlan.chunks) {
      if (chunk.translation === null) {
        const t = (aligned[mi] ?? '').trim();
        chunk.translation = t;
        if (t) {
          void db
            .doc(`tenants/${tenantId}/_translations/${chunk.hash}`)
            .set({ translation: t, targetLang, paperId, createdAt: Date.now() })
            .catch(() => {});
          tmPairs.push({ source: chunk.text, translation: t });
        }
        mi++;
      }
    }
    // ADR-045 Tier 4: remember these pairs for future consistency (best-effort).
    void tmStore(tenantId, tmPairs, targetLang).catch(() => {});
    const assembled = paragraphPlan.chunks
      .map((c) => c.translation ?? '')
      .join(paragraphPlan.separator);
    // Also write the full-selection hash so the next exact drag is O(1).
    void cacheRef
      .set({ translation: assembled, targetLang, paperId, createdAt: Date.now() })
      .catch(() => {});
    return NextResponse.json({ paperId, targetLang, translation: assembled, cached: false });
  }

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
      const noText = translation === '[NO_TEXT]' || translation === '';
      if (translation && !truncated && !noText) {
        void cacheRef
          .set({ translation, targetLang, paperId, createdAt: Date.now() })
          .catch(() => {});
        // Also cache per-paragraph so a future drag covering some of the same
        // text gets a partial-hit speedup (text mode only — image/dual have no
        // 1:1 paragraph alignment between input and output).
        if (mode === 'text') {
          const inParas = splitParagraphs(text);
          const outParas = splitParagraphs(translation);
          if (inParas.length === outParas.length && inParas.length > 1) {
            for (let i = 0; i < inParas.length; i++) {
              const h = chunkHash(inParas[i], targetLang);
              void db
                .doc(`tenants/${tenantId}/_translations/${h}`)
                .set({ translation: outParas[i], targetLang, paperId, createdAt: Date.now() })
                .catch(() => {});
            }
          }
        }
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
