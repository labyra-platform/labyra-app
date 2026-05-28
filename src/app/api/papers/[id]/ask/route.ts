/**
 * POST /api/papers/{id}/ask — Ask AI inside a single paper.
 *
 * R237am foundation: vector + BM25 + rerank retrieval restricted to one paper,
 * empty-retrieval lane (no model call when nothing relevant), intent classify
 * (Flash easy / Sonnet hard), streamed grounded answer, citation chips, trust
 * score. Anti-hallucination follows Labyra's L1–L7 stack: cite-or-refuse, hedge
 * preservation, no off-source claims, selection-mode quote-first.
 *
 * Persists every turn to tenants/{tid}/papers/{pid}/qa/{messageId} so the
 * conversation re-opens when the user comes back. Reads are gated by the same
 * userId rule as annotations (firestore.rules R237am).
 */
import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { estimateCost } from '@/lib/ai/cost/estimator';
import { recordCost } from '@/lib/ai/cost/telemetry';
import { classifyIntent } from '@/lib/ai/dispatcher/intent-classifier';
import { checkCostGuard } from '@/lib/ai/governance/cost-guard';
import { selectProvider } from '@/lib/ai/providers';
import { searchPapers } from '@/lib/ai/rag/search';
import type { SearchHit } from '@/lib/ai/rag/search-types';
import { getGroupIdFromToken, getRoleFromToken, getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { AiTier } from '@/types/ai';
import {
  ASK_META_SENTINEL,
  type AskCitation,
  type AskRequestBody,
  type AskStreamMeta
} from '@/features/papers/ask/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VECTOR_TOP_K = 20;
const TOP_N = 5;
/** Below this rerank score we treat retrieval as "nothing relevant" and refuse
 *  to answer — Labyra's L1 cite-or-refuse rule. Tuned conservatively; if the
 *  best chunk in the paper barely matches the question, an answer will mostly
 *  be guessed from the model's prior, exactly what Trust > Coverage forbids. */
const EMPTY_RETRIEVAL_THRESHOLD = 0.4;
const MAX_QUESTION_CHARS = 2000;
const MAX_SELECTION_CHARS = 4000;

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

function buildSystemPrompt(args: {
  paperTitle: string;
  hasSelection: boolean;
  hits: SearchHit[];
}): string {
  const sourceBlocks = args.hits
    .map(
      (h, i) =>
        `[${i + 1}] (section: ${h.section || 'unknown'}, pages: ${h.pages.join(', ')})\n${h.text}`
    )
    .join('\n\n');

  return `You are Labyra's reading assistant for a single scientific paper. Answer ONLY from the SOURCE PASSAGES below — these are chunks retrieved from the paper "${args.paperTitle}". You are NOT allowed to draw on outside knowledge, training data, or general scientific common sense.

Rules (every one is mandatory):
1. CITE OR REFUSE. Every factual sentence must be backed by one of the numbered sources and end with its bracket, e.g. "The catalyst is IrNC@TiO2 [2]." If no source supports a claim, do not write the claim.
2. NO-ANSWER PATH. If the sources don't actually contain the answer, reply with exactly:
   "Tôi không tìm thấy nội dung này trong paper."
   (followed by a one-sentence explanation of what the paper does cover, if anything). Never invent.
3. KEEP HEDGES. If the paper says "may", "could", "suggests", "possibly", reproduce that hedge ("có thể", "gợi ý"). Never upgrade certainty.
4. NO OUTSIDE FACTS. Do not add common-knowledge context the paper itself doesn't state. If a number, value, or claim is not in the sources, omit it.
5. CHEMICAL FIDELITY. Reproduce chemical formulae, units, and symbols verbatim (NaOH, H₂O₂, IrCl₃·xH₂O, cm⁻¹). Use <sub>/<sup> tags for subscripts and superscripts; use <b>/<i> for emphasis if the source emphasises; leave equations inside <math>…</math> with LaTeX (ASCII only — never put Vietnamese or prose inside <math>; that tag is for formulae only).
6. ANSWER IN VIETNAMESE by default unless the user clearly writes the question in English (then mirror the user's language).${
    args.hasSelection
      ? `
7. SELECTION MODE. The user has highlighted a specific passage. Start your answer with a 1–2 sentence direct quote from THAT passage (in the original language, marked with «…»), then provide your grounded interpretation citing the numbered sources. Do not stray to other parts of the paper unless the question explicitly asks you to.`
      : ''
  }

SOURCE PASSAGES:
${sourceBlocks}`;
}

function buildUserPrompt(question: string, selectionText: string | undefined): string {
  if (!selectionText) return question;
  return `[Selected passage from the paper]\n${selectionText}\n\n[Question about this passage]\n${question}`;
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
  const userId = decoded.uid;
  const role = getRoleFromToken(decoded);
  const isPrivileged = role === 'admin' || role === 'superadmin';
  const viewerGroupId = getGroupIdFromToken(decoded) ?? null;

  // ─── Rate limit (cheaper than retrieval failures) ─────────────
  const rl = await checkRateLimit(rateLimitKey('paper-ask', userId), 60, 60);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { retryAfter: rl.resetSec });

  // ─── Body ─────────────────────────────────────────────────────
  let body: AskRequestBody;
  try {
    body = (await request.json()) as AskRequestBody;
  } catch {
    return jsonError(400, 'invalid_json');
  }
  const question = (body.question ?? '').trim();
  const selectionText = body.selectionText?.trim() || undefined;
  if (!question) return jsonError(400, 'empty_question');
  if (question.length > MAX_QUESTION_CHARS) {
    return jsonError(413, 'question_too_long', { max: MAX_QUESTION_CHARS });
  }
  if (selectionText && selectionText.length > MAX_SELECTION_CHARS) {
    return jsonError(413, 'selection_too_long', { max: MAX_SELECTION_CHARS });
  }

  const db = getAdminFirestoreService();

  // ─── Fetch paper title (for the prompt + UI continuity) ───────
  let paperTitle = '';
  try {
    const paperSnap = await db.doc(`tenants/${tenantId}/papers/${paperId}`).get();
    if (!paperSnap.exists) return jsonError(404, 'paper_not_found');
    const paperData = paperSnap.data() as { title?: string } | undefined;
    paperTitle = paperData?.title ?? '';
  } catch {
    return jsonError(500, 'paper_fetch_failed');
  }

  // ─── Persist the user turn upfront (in case the model call fails) ─
  const userMsgId = db.collection(`tenants/${tenantId}/papers/${paperId}/qa`).doc().id;
  const turnStarted = Date.now();
  await db
    .doc(`tenants/${tenantId}/papers/${paperId}/qa/${userMsgId}`)
    .set({
      id: userMsgId,
      tenantId,
      userId,
      paperId,
      role: 'user',
      content: question,
      selectionText: selectionText ?? null,
      createdAt: Timestamp.fromMillis(turnStarted)
    })
    .catch(() => {});

  // ─── Retrieve (vector + BM25 + RRF + rerank, filtered to this paper) ─
  // Combining the search query with any selection text is intentional: when the
  // user asks "why?" about a highlighted passage, the passage IS the query.
  const retrievalQuery = selectionText ? `${question}\n${selectionText}` : question;
  let hits: SearchHit[] = [];
  try {
    const res = await searchPapers({
      tenantId,
      query: retrievalQuery,
      filter: { paperId },
      vectorTopK: VECTOR_TOP_K,
      topN: TOP_N,
      viewerGroupId,
      isPrivileged
    });
    hits = res.hits;
  } catch {
    return jsonError(502, 'retrieval_failed');
  }

  // ─── Empty-retrieval lane: refuse without burning a model call ─
  const topScore = hits[0]?.score ?? 0;
  if (hits.length === 0 || topScore < EMPTY_RETRIEVAL_THRESHOLD) {
    const noAnswer = 'Tôi không tìm thấy nội dung này trong paper.';
    const meta: AskStreamMeta = { citations: [], trustScore: topScore, noAnswer: true };
    const assistantMsgId = db.collection(`tenants/${tenantId}/papers/${paperId}/qa`).doc().id;
    await db
      .doc(`tenants/${tenantId}/papers/${paperId}/qa/${assistantMsgId}`)
      .set({
        id: assistantMsgId,
        tenantId,
        userId,
        paperId,
        role: 'assistant',
        content: noAnswer,
        citations: [],
        trustScore: topScore,
        noAnswer: true,
        createdAt: Timestamp.fromMillis(Date.now())
      })
      .catch(() => {});
    return new Response(`${noAnswer}${ASK_META_SENTINEL}${JSON.stringify(meta)}`, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Ask-NoAnswer': '1'
      }
    });
  }

  // ─── Intent classify → tier ───────────────────────────────────
  // Easy factual lookup (what is X?) → Flash T2. Reasoning/synthesis/compare
  // → Sonnet T3. Selection-mode questions tend to be deeper, so we floor T3.
  let tier: AiTier = 2;
  try {
    const decision = await classifyIntent(question);
    // Classifier outputs T0-T5; clamp to T2/T3 for paper_qa. T4/T5 reserved.
    if (decision.tier >= 3) tier = 3;
  } catch {
    // Classifier is best-effort — default to Flash if it fails.
    tier = 2;
  }
  if (selectionText) tier = Math.max(tier, 3) as AiTier;

  // ─── Cost guard ───────────────────────────────────────────────
  const estimated = estimateCost(tier, 'paper_qa');
  const guard = await checkCostGuard(tenantId, tier, 'paper_qa', estimated);
  if (!guard.allowed) return jsonError(402, 'cost_guard_blocked', { reason: guard.reason });

  // ─── Build prompt + citations payload ─────────────────────────
  const system = buildSystemPrompt({ paperTitle, hasSelection: Boolean(selectionText), hits });
  const userPrompt = buildUserPrompt(question, selectionText);
  const citations: AskCitation[] = hits.map((h, i) => ({
    idx: i + 1,
    chunkId: `${h.paperId}-${h.chunkIdx}`,
    chunkIdx: h.chunkIdx,
    page: h.pages[0] ?? 1,
    section: h.section,
    snippet: h.text.slice(0, 240),
    score: h.score
  }));
  const trustScore = citations.reduce((s, c) => s + c.score, 0) / Math.max(citations.length, 1);

  // ─── Stream the grounded answer ───────────────────────────────
  const { provider, config } = selectProvider(tier);
  const capability = tier >= 3 ? 'reasoning-balanced' : 'rag-balanced';
  const started = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = '';
      let truncated = false;
      try {
        for await (const event of provider.streamChat({
          model: config.model,
          maxTokens: 4096,
          temperature: 0.1, // Low — we want grounded paraphrase, not creativity.
          system: [{ text: system, cache: true, cacheTtl: '1h' }],
          messages: [{ role: 'user', content: userPrompt }]
        })) {
          if (event.type === 'text_delta') {
            full += event.delta;
            controller.enqueue(encoder.encode(event.delta));
          } else if (event.type === 'message_complete') {
            if (event.stopReason === 'max_tokens') truncated = true;
            void recordCost({
              tenantId,
              tier,
              capability,
              feature: 'paper_qa',
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
        controller.error(new Error('answer_failed'));
        return;
      }

      // Trailing meta frame — citations + trust score for the UI.
      const meta: AskStreamMeta = { citations, trustScore, noAnswer: false };
      controller.enqueue(encoder.encode(`${ASK_META_SENTINEL}${JSON.stringify(meta)}`));
      controller.close();

      // Persist the assistant turn (best-effort; truncated answers are kept so
      // the user sees what was generated, but flagged via the saved content).
      const trimmed = full.trim();
      if (trimmed) {
        const assistantMsgId = db.collection(`tenants/${tenantId}/papers/${paperId}/qa`).doc().id;
        void db
          .doc(`tenants/${tenantId}/papers/${paperId}/qa/${assistantMsgId}`)
          .set({
            id: assistantMsgId,
            tenantId,
            userId,
            paperId,
            role: 'assistant',
            content: trimmed,
            citations,
            trustScore,
            noAnswer: false,
            truncated,
            createdAt: Timestamp.fromMillis(Date.now())
          })
          .catch(() => {});
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Ask-Stream': '1'
    }
  });
}
