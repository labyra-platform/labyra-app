/**
 * Deep research over a single paper (Round 1). Instead of one retrieval + answer,
 * it decomposes the question into focused sub-questions, retrieves for each in
 * parallel, then synthesises a structured, grounded report with citations — the
 * paper-scoped analogue of Perplexity Pro Search. Reuses the Ask AI stream
 * contract (content stream + trailing ASK_META meta frame) so the client only
 * needs a mode toggle. Library-wide research is a later round.
 */
import { Timestamp } from 'firebase-admin/firestore';

import {
  ASK_META_SENTINEL,
  type AskCitation,
  type AskStreamMeta,
  splitFollowups
} from '@/features/papers/ask/types';
import { estimateCost } from '@/lib/ai/cost/estimator';
import { checkCostGuard } from '@/lib/ai/governance/cost-guard';
import { selectProvider } from '@/lib/ai/providers';
import { searchPapers } from '@/lib/ai/rag/search';
import type { SearchHit } from '@/lib/ai/rag/search-types';
import { verifyNumericClaims } from '@/lib/ai/verify/numeric-claims';
import { getGroupIdFromToken, getRoleFromToken, getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { Paper } from '@/types/papers';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SUBQ_COUNT = 4;
const CHUNKS_PER_SUBQ = 4;
const MAX_TOTAL_CHUNKS = 14;
const VECTOR_TOP_K = 20;
const MAX_QUESTION_CHARS = 2000;

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status });
}

/** Decompose the research question into focused sub-questions (cheap T2 call). */
async function decompose(question: string, paperTitle: string): Promise<string[]> {
  const { provider, config } = selectProvider(2);
  try {
    const res = await provider.complete({
      model: config.model,
      maxTokens: 400,
      temperature: 0.3,
      thinkingBudget: 0,
      system: [
        {
          text: `You decompose a research question about a single scientific document into ${SUBQ_COUNT} focused, non-overlapping sub-questions that together cover it comprehensively. Each must be answerable from the document, and phrased in the same language as the question. Return ONLY a JSON array of ${SUBQ_COUNT} strings — no prose, no numbering.`
        }
      ],
      messages: [
        { role: 'user', content: `Paper: "${paperTitle}"\nResearch question: ${question}` }
      ]
    });
    const match = /\[[\s\S]*\]/.exec(res.text);
    if (!match) return [question];
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [question];
    const qs = parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 3)
      .slice(0, SUBQ_COUNT);
    return qs.length > 0 ? qs : [question];
  } catch {
    return [question];
  }
}

function buildSynthesisPrompt(
  paperTitle: string,
  subQuestions: string[],
  hits: SearchHit[],
  locale?: string
): string {
  const answerLangRule =
    locale === 'en'
      ? 'Answer in English by default unless the question is in another language.'
      : 'Answer in Vietnamese by default unless the question is in English.';
  const sourceBlocks = hits
    .map(
      (h, i) =>
        `[${i + 1}] (section: ${h.section || 'unknown'}, pages: ${h.pages.join(', ')})\n${h.text}`
    )
    .join('\n\n');
  const aspects = subQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  return `You are Labyra's deep-research assistant for the document "${paperTitle}". Write a comprehensive, well-structured research answer to the user's question, grounded ONLY in the numbered SOURCE PASSAGES below. Do not use outside knowledge.

Organise the answer around these aspects (a bold header per aspect):
${aspects}

Rules (mandatory):
1. CITE OR OMIT. Every factual claim ends with its source bracket, e.g. "[2]". If the sources don't support a claim, omit it — never invent.
2. STRUCTURE. Use **bold** aspect headers and short paragraphs / "- " bullets. Be thorough but strictly grounded.
3. COVERAGE. If the sources don't cover an aspect, say so briefly instead of padding.
4. KEEP HEDGES; reproduce chemical formulae/units verbatim; write math as LaTeX $…$ or $$…$$.
5. ${answerLangRule}
After the answer, append a line with exactly [[FOLLOWUP]] then 2-3 short follow-up questions (one per line).

SOURCE PASSAGES:
${sourceBlocks}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: paperId } = await params;

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
  const viewerGroupId = getGroupIdFromToken(decoded);
  const role = getRoleFromToken(decoded);
  const isPrivileged = role === 'admin' || role === 'superadmin';

  const rl = await checkRateLimit(rateLimitKey('paper-research', tenantId), 20, 60);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { retryAfter: rl.resetSec });

  let body: { question?: string; locale?: string };
  try {
    body = (await request.json()) as { question?: string };
  } catch {
    return jsonError(400, 'invalid_json');
  }
  const question = body.question?.trim();
  if (!question) return jsonError(400, 'empty_question');
  if (question.length > MAX_QUESTION_CHARS) {
    return jsonError(413, 'question_too_long', { max: MAX_QUESTION_CHARS });
  }

  const db = getAdminFirestoreService();
  let paperTitle = 'this document';
  try {
    const snap = await db.doc(`tenants/${tenantId}/papers/${paperId}`).get();
    if (!snap.exists) return jsonError(404, 'paper_not_found');
    paperTitle = (snap.data() as Paper).title || paperTitle;
  } catch {
    return jsonError(500, 'paper_fetch_failed');
  }

  // Deep research is heavier than a single Q&A — budget it at tier 3.
  const estimated = estimateCost(3, 'paper_qa');
  const guard = await checkCostGuard(tenantId, 3, 'paper_qa', estimated);
  if (!guard.allowed) return jsonError(402, 'cost_guard_blocked', { reason: guard.reason });

  const turnStarted = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 1. Decompose into sub-questions.
        const subQuestions = await decompose(question, paperTitle);

        // 2. Stream the plan first so the user sees the research approach.
        const planMd = `**Kế hoạch nghiên cứu**\n${subQuestions.map((q) => `- ${q}`).join('\n')}\n\n---\n\n`;
        controller.enqueue(encoder.encode(planMd));

        // 3. Retrieve for each sub-question in parallel; dedupe chunks.
        const results = await Promise.all(
          subQuestions.map((sq) =>
            searchPapers({
              tenantId,
              query: sq,
              filter: { paperId },
              vectorTopK: VECTOR_TOP_K,
              topN: CHUNKS_PER_SUBQ,
              viewerGroupId,
              isPrivileged
            }).catch(() => ({ hits: [] as SearchHit[] }))
          )
        );
        const seen = new Set<number>();
        const hits: SearchHit[] = [];
        for (const res of results) {
          for (const h of res.hits) {
            if (!seen.has(h.chunkIdx) && hits.length < MAX_TOTAL_CHUNKS) {
              seen.add(h.chunkIdx);
              hits.push(h);
            }
          }
        }

        if (hits.length === 0) {
          controller.enqueue(
            encoder.encode(
              body.locale === 'en'
                ? 'I could not find relevant content in the document to research this question.'
                : 'Tôi không tìm thấy nội dung liên quan trong tài liệu để nghiên cứu câu hỏi này.'
            )
          );
          const meta: AskStreamMeta = { citations: [], trustScore: 0, noAnswer: true };
          controller.enqueue(encoder.encode(`${ASK_META_SENTINEL}${JSON.stringify(meta)}`));
          controller.close();
          return;
        }

        // 4. Synthesise the report (tier 3 for quality), streaming.
        const { provider, config } = selectProvider(3);
        const system = buildSynthesisPrompt(paperTitle, subQuestions, hits, body.locale);
        let full = '';
        for await (const event of provider.streamChat({
          model: config.model,
          maxTokens: 4096,
          temperature: 0.2,
          thinkingBudget: 0,
          system: [{ text: system, cache: true, cacheTtl: '1h' }],
          messages: [{ role: 'user', content: question }]
        })) {
          if (event.type === 'text_delta') {
            full += event.delta;
            controller.enqueue(encoder.encode(event.delta));
          }
        }

        // 5. Trailing meta — citations + verification (on the report only).
        const { answer: report, questions } = splitFollowups(full);
        const citations: AskCitation[] = hits.map((h, i) => ({
          idx: i + 1,
          chunkId: `${h.paperId}-${h.chunkIdx}`,
          chunkIdx: h.chunkIdx,
          page: h.pages[0] ?? 1,
          section: h.section,
          snippet: h.text.slice(0, 240),
          score: h.score
        }));
        const trustScore =
          citations.reduce((s, c) => s + c.score, 0) / Math.max(citations.length, 1);
        const verification = verifyNumericClaims(report, hits);
        const meta: AskStreamMeta = { citations, trustScore, noAnswer: false, verification };
        controller.enqueue(encoder.encode(`${ASK_META_SENTINEL}${JSON.stringify(meta)}`));
        controller.close();

        console.warn(
          JSON.stringify({
            event: 'research_done',
            paperId,
            subQuestions: subQuestions.length,
            chunks: hits.length,
            totalMs: Date.now() - turnStarted
          })
        );

        // 6. Persist as a Q&A turn (plan + report) so it restores and feeds
        // follow-ups — same collection the Ask AI panel reads.
        const persistContent = `${planMd}${report}`.trim();
        try {
          const userMsgId = db.collection(`tenants/${tenantId}/papers/${paperId}/qa`).doc().id;
          await db.doc(`tenants/${tenantId}/papers/${paperId}/qa/${userMsgId}`).set({
            id: userMsgId,
            tenantId,
            userId,
            paperId,
            role: 'user',
            content: question,
            createdAt: Timestamp.fromMillis(turnStarted)
          });
          const aMsgId = db.collection(`tenants/${tenantId}/papers/${paperId}/qa`).doc().id;
          await db.doc(`tenants/${tenantId}/papers/${paperId}/qa/${aMsgId}`).set({
            id: aMsgId,
            tenantId,
            userId,
            paperId,
            role: 'assistant',
            content: persistContent,
            citations,
            trustScore,
            verification,
            suggestedQuestions: questions,
            noAnswer: false,
            createdAt: Timestamp.fromMillis(Date.now())
          });
        } catch {
          // best-effort persistence
        }
      } catch {
        controller.enqueue(encoder.encode('\n\n_Lỗi nghiên cứu sâu. Thử lại nhé._'));
        controller.close();
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
