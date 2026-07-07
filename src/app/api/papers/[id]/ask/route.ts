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
export const maxDuration = 300;

const VECTOR_TOP_K = 20;
const TOP_N = 5;
// Grounded RAG extraction needs little reasoning; disabling thinking cuts the
// biggest chunk of time-to-first-token (Gemini 3 thinks by default). Tunable.
const PAPER_QA_THINKING_BUDGET = 0;
// Conversation memory — feed recent turns so follow-ups ("tại sao?", "giải thích
// thêm") resolve against context. Kept short to bound prefill (protects TTFT).
const HISTORY_TURNS = 6;
const HISTORY_CONTENT_MAX = 1000;
const FOLLOWUP_MAX_WORDS = 6;
const FOLLOWUP_TOKENS = new Set([
  'đó',
  'nó',
  'này',
  'kia',
  'ấy',
  'vậy',
  'thế',
  'họ',
  'chúng',
  'thêm',
  'nữa',
  'tiếp',
  'còn',
  'sao',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'they',
  'them',
  'more',
  'why',
  'how'
]);
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
5. FORMATTING & CHEMICAL FIDELITY. Structure the answer in standard Markdown: **bold** for key terms, "- " bullet lists for enumerations, short paragraphs. Write ALL mathematics as LaTeX delimited by $…$ (inline) or $$…$$ (a standalone displayed equation) — e.g. $E_F(\\text{bulk})$, $$\\Delta G_{H^*}=E_{ads}-\\tfrac12 E_{H_2}$$. Reproduce chemical formulae, units, and symbols verbatim (NaOH, H₂O₂, IrCl₃·xH₂O, cm⁻¹); prefer LaTeX for formulae with sub/superscripts ($\\text{WO}_3$, $\\text{cm}^{-1}$) so they render and paste into Word as real equations. Never put Vietnamese or prose inside the math delimiters — they are for formulae only.
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

/**
 * Load the user's recent Q&A turns for this paper (oldest → newest) so follow-up
 * questions have context. Best-effort: if the composite index (userId, createdAt)
 * is missing, degrade to no history rather than failing the request.
 */
async function loadRecentTurns(
  db: ReturnType<typeof getAdminFirestoreService>,
  tenantId: string,
  paperId: string,
  userId: string,
  limit: number
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  try {
    // Order by createdAt only (single-field, auto-indexed) and filter userId in
    // memory — avoids requiring a composite (userId, createdAt) index. Over-fetch
    // so the user's recent turns survive interleaving from other group members.
    const snap = await db
      .collection(`tenants/${tenantId}/papers/${paperId}/qa`)
      .orderBy('createdAt', 'desc')
      .limit(limit * 4)
      .get();
    const turns = snap.docs
      .map((d) => d.data())
      .filter(
        (m) =>
          m.userId === userId &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          (m.content as string).trim() !== '' &&
          m.noAnswer !== true
      )
      .slice(0, limit)
      .toReversed()
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: (m.content as string).slice(0, HISTORY_CONTENT_MAX)
      }));
    console.warn(JSON.stringify({ event: 'history_loaded', paperId, turns: turns.length }));
    return turns;
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: 'history_load_failed',
        paperId,
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)
      })
    );
    return [];
  }
}

const LOCATOR_KINDS: { re: RegExp; labels: string[] }[] = [
  {
    re: /(phương\s*trình|công\s*thức|equation|\beq\b|\beqn\b)/i,
    labels: ['Eq.', 'Equation', 'equation']
  },
  { re: /(hình(\s*vẽ)?|figure|\bfig\b)/i, labels: ['Fig.', 'Figure', 'figure'] },
  { re: /(bảng|table)/i, labels: ['Table', 'table'] }
];

/** Extract the numbers a locator query targets, expanding ranges (11 đến 13 → 11,12,13). */
function extractLocatorNumbers(q: string): number[] {
  const range = /(\d+)\s*(?:-|–|—|đến|tới|to|through)\s*(\d+)/i.exec(q);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (b >= a && b - a <= 20) return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return [...q.matchAll(/\b(\d{1,3})\b/g)].map((m) => Number(m[1])).slice(0, 8);
}

/** "giải thích phương trình 11 đến 13" retrieves poorly because it references
 *  equation NUMBERS (locators) in Vietnamese while the paper writes "Eq. (11)" in
 *  English. Expand with the cross-lingual + numbered forms so BM25 can match the
 *  discussing chunk. Retrieval-side only — the deeper fix is indexing
 *  equations/figures/tables as numbered units. */
function expandLocatorQuery(q: string): { query: string; isLocator: boolean } {
  const kind = LOCATOR_KINDS.find((k) => k.re.test(q));
  if (!kind) return { query: q, isLocator: false };
  const nums = extractLocatorNumbers(q);
  if (nums.length === 0) return { query: q, isLocator: false };
  const terms: string[] = [];
  for (const n of nums) {
    for (const label of kind.labels) terms.push(`${label} ${n}`, `${label} (${n})`);
    terms.push(`(${n})`);
  }
  return { query: `${q} ${terms.join(' ')}`, isLocator: true };
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

  // ─── Load recent conversation turns (before persisting this one) ─
  const history = await loadRecentTurns(db, tenantId, paperId, userId, HISTORY_TURNS);

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
  // For follow-ups ("tại sao?", "giải thích thêm"), prepend the previous question
  // so retrieval has the antecedent — cheaply, without an extra LLM rewrite call.
  const words = question
    .toLowerCase()
    .split(/[\s,.!?;:]+/)
    .filter(Boolean);
  const isFollowUp =
    history.length > 0 &&
    (words.length <= FOLLOWUP_MAX_WORDS || words.some((w) => FOLLOWUP_TOKENS.has(w)));
  const lastUserTurn = history.toReversed().find((t) => t.role === 'user');
  const contextPrefix = isFollowUp && lastUserTurn ? `${lastUserTurn.content}\n` : '';
  // Expand "phương trình 11 đến 13" / "hình 2" locators to their cross-lingual
  // numbered forms so retrieval finds the chunk that discusses them.
  const locator = expandLocatorQuery(question);
  const baseQuery = selectionText ? `${locator.query}\n${selectionText}` : locator.query;
  const retrievalQuery = `${contextPrefix}${baseQuery}`;
  // Intent classify only needs the question, so run it in parallel with retrieval
  // (it used to run serially after) — overlapping saves ~1s off first-token time.
  const tClassify = Date.now();
  let classifyMs = 0;
  const classifyPromise: Promise<AiTier> = classifyIntent(question)
    .then((d) => (d.tier >= 3 ? 3 : 2) as AiTier)
    .catch(() => 2 as AiTier)
    .then((t) => {
      classifyMs = Date.now() - tClassify;
      return t;
    });
  let hits: SearchHit[] = [];
  let retrievalMs = 0;
  const tRetrieve = Date.now();
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
    retrievalMs = Date.now() - tRetrieve;
  } catch (e) {
    return jsonError(502, 'retrieval_failed', {
      detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300)
    });
  }

  // ─── Empty-retrieval lane: refuse without burning a model call ─
  // Locator queries (equation/figure/table by number) get a lower bar — the
  // element is in the paper even when its chunk scores low semantically.
  const topScore = hits[0]?.score ?? 0;
  const emptyThreshold = locator.isLocator ? 0.15 : EMPTY_RETRIEVAL_THRESHOLD;
  if (hits.length === 0 || topScore < emptyThreshold) {
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

  // ─── Intent tier (classify ran in parallel with retrieval above) ─
  // Selection-mode questions tend to be deeper, so we floor T3.
  let tier: AiTier = await classifyPromise;
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
      let firstTokenMs = 0;
      try {
        for await (const event of provider.streamChat({
          model: config.model,
          maxTokens: 4096,
          temperature: 0.1, // Low — we want grounded paraphrase, not creativity.
          thinkingBudget: PAPER_QA_THINKING_BUDGET,
          system: [{ text: system, cache: true, cacheTtl: '1h' }],
          messages: [...history, { role: 'user', content: userPrompt }]
        })) {
          if (event.type === 'text_delta') {
            if (firstTokenMs === 0) firstTokenMs = Date.now() - started;
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
      } catch (e) {
        // A stream `controller.error` reaches the client only as an opaque
        // network failure, so emit the real cause as visible text instead.
        const detail = e instanceof Error ? e.message.slice(0, 300) : 'answer_failed';
        if (!full) controller.enqueue(encoder.encode(`⚠ AI error: ${detail}`));
        controller.close();
        return;
      }

      // R404: end-to-end timing profile for bottleneck analysis. Filter Vercel
      // logs by event=ask_timing (retrieval detail is event=search_timing).
      // genFirstTokenMs = the "silence" the user feels once generation starts;
      // totalMs = full request. Remove after latency is understood.
      console.warn(
        JSON.stringify({
          event: 'ask_timing',
          paperId,
          tier,
          retrievalMs,
          classifyMs,
          genFirstTokenMs: firstTokenMs,
          genTotalMs: Date.now() - started,
          totalMs: Date.now() - turnStarted,
          answerChars: full.length
        })
      );

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
