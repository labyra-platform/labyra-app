/**
 * POST /api/chat — Streaming chat endpoint v5.
 *
 * R160-ai-3c1: Tool calling support.
 *   1. Classify intent → tier
 *   2. Provider streams with tools registered
 *   3. If tool_use: execute → feedback to provider → continue (up to 3 rounds)
 *   4. Persist messages + tool calls + provenance
 *
 * @phase R160-ai-3c1
 */

import { Timestamp } from 'firebase-admin/firestore';
import { after, NextResponse } from 'next/server';
import { getCapabilityForTier } from '@/lib/ai/config/capabilities';
import { loadConversationHistory } from '@/lib/ai/conversation-history';
import { estimateCost } from '@/lib/ai/cost/estimator';
// R169-4: cost telemetry
import { recordCost } from '@/lib/ai/cost/telemetry';
import { classifyIntent } from '@/lib/ai/dispatcher/intent-classifier';
// R170-5: Cost Guard pre-check
import { checkCostGuard } from '@/lib/ai/governance/cost-guard';
import { checkGrounding } from '@/lib/ai/grounding';
import { classifyOnTopic, offTopicResponse } from '@/lib/ai/grounding/on-topic-check';
import { writeProvenance } from '@/lib/ai/provenance-writer';
import { selectProvider } from '@/lib/ai/providers';
import type { LLMMessage, LLMToolCall } from '@/lib/ai/providers/types';
import { runReflection } from '@/lib/ai/reflection/orchestrator';
import { LABYRA_SYSTEM_PROMPT, LABYRA_TOOLS_BLOCK } from '@/lib/ai/system-prompt';
import { buildSystemPromptWithMemory } from '@/lib/ai/memory/system-prompt-builder';
import { extractFactsAsync } from '@/lib/ai/memory/extract-orchestrator';
import { runWriter } from '@/lib/ai/tier4-writer/orchestrator';
import { generateConversationTitle } from '@/lib/ai/title-generator';
import { executeToolCall } from '@/lib/ai/tools/dispatch';
import { getToolDefinitions } from '@/lib/ai/tools/registry';
import { getTenantIdFromToken, getGroupIdFromToken, getRoleFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { downloadBuffer } from '@/lib/firebase/storage';
import { logger } from '@/lib/logger';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { AiCostBreakdown, AiTier, ChatRequestBodyV2, ChatStreamEventV2 } from '@/types/ai';

export const runtime = 'nodejs';
// Bug fix: RAG chat (multi-tier + tool rounds + Pinecone hybrid search + rerank)
// can exceed Vercel Pro's default 15s. Raise to 60s so the 20s per-tool
// timeout is meaningful and broad queries (e.g. '2D materials') don't get cut.
export const maxDuration = 60;

const MAX_TOOL_ROUNDS = 3;

// R176-3c-thoughtsignature-persistence
interface ToolCallRecord {
  thoughtSignature?: string; // R176-3c: Gemini 3 multi-turn signature
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
}

// R160-ai-5e-1c: Strip $word$ wrappers around non-math text
// Math has: numbers, Greek/Latin letters with backslash commands, operators
// Non-math: Vietnamese words, English words alone — strip the $
function stripVietnameseDollar(text: string): string {
  // Match $...$ where content has no math indicators (no \\, no _, no ^, no digits)
  // and contains Vietnamese diacritics or pure letters
  return text.replace(/\$([^$\n]{1,30})\$/g, (match, inner) => {
    // Has math indicators? Keep as-is
    if (/[\\_^{}]/.test(inner)) return match;
    if (/\d/.test(inner)) return match; // contains digit = likely math
    // Pure text wrap = strip dollars
    return inner;
  });
}

function addUsage(a: AiCostBreakdown, b: AiCostBreakdown): AiCostBreakdown {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    usd: Number((a.usd + b.usd).toFixed(6))
  };
}

// M7: per-tool timeout to prevent runaway tool calls
// R188-4-phase1-tool-timeout
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('tool_timeout')), ms))
  ]);
}

// H2: sanitize string — strip control chars + truncate (outer scope per unicorn rule)
function sanitizeStr(s: string, max: number): string {
  // H2: remove control chars (<0x20) and angle brackets — no regex to avoid oxlint no-control-regex
  let out = '';
  for (let i = 0; i < s.length && out.length < max; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x20 && s[i] !== '<' && s[i] !== '>') out += s[i];
  }
  return out;
}

export async function POST(request: Request) {
  // Auth
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'missing_token' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    });
  }

  const idToken = authHeader.slice('Bearer '.length);
  let decoded;
  try {
    decoded = await getAdminAuthService().verifyIdToken(idToken);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    });
  }

  const tenantId = getTenantIdFromToken(decoded);
  const userId = decoded.uid;
  // ADR-034 TEAM-5: RAG group scope for tool context.
  const viewerGroupId = getGroupIdFromToken(decoded);
  const viewerRole = getRoleFromToken(decoded);
  const isPrivileged = viewerRole === 'admin' || viewerRole === 'superadmin';
  const userEmail = decoded.email ?? '';

  // ADR-035 M2: opt-in flag, loaded once at handler scope (gates L2 inject +
  // fact extraction). Declared here so both the after() extraction wire and the
  // system-prompt build call can read it.
  let memoryEnabled = false;
  try {
    const { loadProceduralMemory } = await import('@/lib/ai/memory/loader');
    const prefsForMem = await loadProceduralMemory(userId);
    memoryEnabled = prefsForMem?.enableMemory === true;
  } catch {
    /* non-fatal */
  }
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'missing_tenant_claim' }), {
      status: 403,
      headers: { 'content-type': 'application/json' }
    });
  }

  // R162-tier-rate-limit — per-tenant rate limit
  const rl = await checkRateLimit(rateLimitKey('chat', `${tenantId}:${decoded.uid}`), 5, 60);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'Retry-After': String(rl.resetSec)
      }
    });
  }

  // Body
  let body: ChatRequestBodyV2;
  try {
    body = (await request.json()) as ChatRequestBodyV2;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }
  if (!body.message || typeof body.message !== 'string') {
    return new Response(JSON.stringify({ error: 'message_required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }
  // H2: length cap — prevent prompt injection via oversized input
  if (body.message.length > 4000) {
    return new Response(JSON.stringify({ error: 'message_too_long', maxLength: 4000 }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const userText = body.message;

  // ADR-036: validate image attachments (phase 2a — max 4, path must belong
  // to this tenant's chat-attachments to prevent cross-tenant traversal).
  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (rawAttachments.length > 4) {
    return new Response(JSON.stringify({ error: 'too_many_attachments', max: 4 }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }
  const db = getAdminFirestoreService();
  const tenantRef = db.collection('tenants').doc(tenantId);

  // Conversation get-or-create
  let conversationId = body.conversationId;
  let isNewConversation = false;
  const now = Timestamp.now();

  if (!conversationId) {
    isNewConversation = true;
    const newRef = tenantRef.collection('aiConversations').doc();
    conversationId = newRef.id;
    await newRef.set({
      title: 'Untitled',
      userId,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      totalCost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        usd: 0
      }
    });
  } else {
    // R178-2c-fix-1: enforce referential integrity. Client supplied
    // conversationId — verify it exists + belongs to user, else 410 Gone
    // (prevents orphan messages with no parent doc).
    const probe = await tenantRef.collection('aiConversations').doc(conversationId).get();
    if (!probe.exists) {
      return new NextResponse(
        JSON.stringify({
          error: {
            code: 'CONVERSATION_GONE',
            message: 'Conversation no longer exists. Please start a new chat.'
          }
        }),
        { status: 410, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const probeData = probe.data() as { userId?: string };
    if (probeData.userId !== userId) {
      return new NextResponse('forbidden', { status: 403 });
    }
  }

  const convRef = tenantRef.collection('aiConversations').doc(conversationId);

  // R178-2a: load selectedPaperIds for RAG scoping (NotebookLM pattern).
  // New convs return [] (no filter). Mid-conversation updates via
  // /api/conversations/[id]/papers reflect on next message turn.
  const convSnap = await convRef.get();
  const convData = convSnap.exists ? (convSnap.data() as { selectedPaperIds?: string[] }) : null;
  const selectedPaperIds = Array.isArray(convData?.selectedPaperIds)
    ? convData.selectedPaperIds.slice(0, 10)
    : [];

  // R178-2c: fetch scoped paper metadata for system prompt context.
  // Builds a list like:
  //   [1] Tongxin Song et al. (2021) — A review of the role and mechanism...
  // appended to system prompt as dynamic (non-cached) segment.
  let scopeSystemBlock: string | null = null;
  if (selectedPaperIds.length > 0) {
    try {
      const paperRefs = selectedPaperIds.map((pid: string) =>
        db.doc(`tenants/${tenantId}/papers/${pid}`)
      );
      const paperSnaps = await db.getAll(...paperRefs);
      const scopedPapers = paperSnaps
        .filter((s) => s.exists)
        .map((s, i) => {
          const d = s.data() as {
            title?: string;
            authors?: string[];
            year?: number;
            doi?: string;
          };
          // H2: strip control chars + truncate to prevent prompt injection
          const authorsStr =
            (d.authors ?? [])
              .slice(0, 2)
              .map((a) => sanitizeStr(a, 100))
              .join(', ') + ((d.authors?.length ?? 0) > 2 ? ' et al.' : '');
          const yearStr = d.year ? ` (${d.year})` : '';
          const title = sanitizeStr(d.title ?? 'Untitled', 256);
          const doi = d.doi ? sanitizeStr(d.doi, 100) : null;
          return `[${i + 1}] ${authorsStr}${yearStr} — ${title}${doi ? ` [DOI: ${doi}]` : ''}`;
        });
      if (scopedPapers.length > 0) {
        scopeSystemBlock = [
          `# Scoped Library (R178-2b)`,
          `The user has scoped this conversation to the following ${scopedPapers.length} paper${scopedPapers.length === 1 ? '' : 's'}:`,
          '',
          ...scopedPapers,
          '',
          `When the user asks ANY question about content (summary, comparison, methodology, findings — even vague prompts like "tóm tắt" / "summarize" / "what does it say"), CALL searchPapers immediately with a broad topic-keyword query derived from these paper titles. Do NOT ask "what do you want to summarize?" — the user already indicated scope. Cite hits as [1], [2], etc. mapped to ref numbers from tool results.`,
          `If the searchPapers result is empty or low-relevance for a scoped query, tell the user explicitly that the scoped papers don't cover that topic, rather than searching outside the scope.`
        ].join('\n');
      }
    } catch (err) {
      console.error('R178-2c scope context build failed', err);
      // Non-fatal — chat continues without scope hint
    }
  }

  // ADR-036: keep only attachments whose path belongs to this tenant + conversation
  const attachmentPrefix = `tenants/${tenantId}/chat-attachments/${conversationId}/`;
  const safeAttachments = rawAttachments.filter(
    (a) =>
      a &&
      typeof a.storagePath === 'string' &&
      a.storagePath.startsWith(attachmentPrefix) &&
      typeof a.mimeType === 'string' &&
      a.mimeType.startsWith('image/')
  );

  // Save user message
  const userMessageRef = convRef.collection('messages').doc();
  await userMessageRef.set({
    role: 'user',
    content: userText,
    createdAt: now,
    userId,
    ...(safeAttachments.length > 0 ? { attachments: safeAttachments } : {})
  });

  // R238a AI-PERF-1/2: kick off the two independent classifiers + history load
  // concurrently. We still AWAIT on-topic first so an off-topic refusal ships as
  // fast as before (no regression for the ~5% off-topic case); the intent
  // classifier (~500-1500ms) and history read run *underneath* it, so for
  // on-topic traffic the ~300-500ms on-topic latency is hidden under intent.
  // classifyIntent never rejects (internal try/catch → fallback), so a dangling
  // promise on the off-topic path is harmless. priorHistory is consumed only by
  // the tool/RAG branch (tiers 0-2); on tier 3/4 the read is wasted but parallel.
  const intentPromise = classifyIntent(userText);
  const historyPromise: Promise<LLMMessage[]> = loadConversationHistory(
    tenantId,
    conversationId!,
    userMessageRef.id // exclude the just-saved pending user message
  ).catch((err: unknown) => {
    logger.warn('history_load_failed', { tenantId, error: String(err) });
    return [];
  });

  // R160-ai-5e-2 L6: OOD check — bail early on off-topic queries
  const onTopic = await classifyOnTopic(userText);
  if (!onTopic.onTopic) {
    // Persist a short refusal as assistant message and stream it
    const refusal = offTopicResponse(userText, 'vi');
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (event: object) => {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        const assistantMsgRefRefusal = convRef.collection('messages').doc();
        send({
          type: 'conversation_init',
          conversationId: conversationId!,
          isNew: isNewConversation
        });
        send({ type: 'message_start', messageId: assistantMsgRefRefusal.id });
        // Stream refusal as a single text_delta
        send({ type: 'text_delta', delta: refusal });
        send({
          type: 'message_complete',
          messageId: assistantMsgRefRefusal.id,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            usd: onTopic.costUsd
          }
        });
        // Persist
        await assistantMsgRefRefusal.set({
          role: 'assistant',
          content: refusal,
          createdAt: Timestamp.now(),
          tier: 1,
          offTopic: true,
          offTopicReason: onTopic.reason
        });
        controller.close();
      }
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  }

  // Tier dispatch — intent classifier was kicked off above (runs under on-topic)
  const intentDecision = await intentPromise;

  // R170-5 [R170-hotfix]: Cost Guard pre-check
  const estimated = estimateCost(intentDecision.tier, intentDecision.feature);
  const costCheck = await checkCostGuard(
    tenantId,
    intentDecision.tier,
    intentDecision.feature,
    estimated
  );

  // R171-4: structured logging for Cost Guard decisions (Vercel logs)
  // eslint-disable-next-line no-console -- intentional structured log
  console.info(
    JSON.stringify({
      event: 'cost_guard_check',
      tenantId,
      tier: intentDecision.tier,
      feature: intentDecision.feature,
      estimated,
      allowed: costCheck.allowed,
      reason: costCheck.reason ?? null,
      dailyCurrent: costCheck.dailyCurrent,
      dailyLimit: costCheck.dailyLimit,
      monthlyCurrent: costCheck.monthlyCurrent,
      monthlyLimit: costCheck.monthlyLimit
    })
  );
  if (!costCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: 'quota_exceeded',
        reason: costCheck.reason,
        dailyCurrent: costCheck.dailyCurrent,
        dailyLimit: costCheck.dailyLimit,
        monthlyCurrent: costCheck.monthlyCurrent,
        monthlyLimit: costCheck.monthlyLimit
      }),
      {
        status: 429,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // R170-7 [R170-hotfix2]: dry-run returns routing decision without LLM
  const dryRunUrl = new URL(request.url);
  if (dryRunUrl.searchParams.get('dry_run') === '1') {
    return NextResponse.json({
      mode: 'dry_run',
      tier: intentDecision.tier,
      feature: intentDecision.feature,
      capability: getCapabilityForTier(intentDecision.tier),
      intentDecision: {
        reason: intentDecision.reason,
        confidence: intentDecision.confidence,
        classifierCostUsd: intentDecision.classifierCostUsd
      },
      estimatedCost: estimated,
      costGuard: {
        dailyCurrent: costCheck.dailyCurrent,
        dailyLimit: costCheck.dailyLimit,
        monthlyCurrent: costCheck.monthlyCurrent,
        monthlyLimit: costCheck.monthlyLimit
      }
    });
  }
  // ADR-036: vision needs >= T1 (gemini-3-flash). T0 flash-lite vision weak.
  const tier: AiTier =
    safeAttachments.length > 0 && intentDecision.tier < 1 ? 1 : intentDecision.tier;
  const { provider, config } = selectProvider(tier);

  const assistantMessageId = convRef.collection('messages').doc().id;
  const startedAt = Date.now();
  const toolDefinitions = getToolDefinitions();

  // R238a AI-PERF-7: for a new conversation, generate the title CONCURRENTLY with
  // the LLM stream instead of after it. The stream takes seconds while Haiku title
  // gen is ~500-1500ms, so by stream end the title is already resolved and the
  // await below is ~free — off the close path, but still pushed live via SSE.
  // Never rejects (.catch → null → keep "Untitled").
  const titlePromise: Promise<string | null> | null = isNewConversation
    ? generateConversationTitle(userText).catch(() => null)
    : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEventV2) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({
          type: 'conversation_init',
          conversationId: conversationId!,
          isNew: isNewConversation
        });
        send({
          type: 'message_start',
          messageId: assistantMessageId,
          tier: tier as 1 | 2 | 3 | 4 | 5
        });

        let fullText = '';
        // R170-4: capture grounding for telemetry (set in T3 branch)
        let groundingForTelemetry:
          | { unverifiedNumbers: number; unsourcedClaims: number }
          | undefined;
        let totalUsage: AiCostBreakdown = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          usd: 0
        };
        const toolCallRecords: ToolCallRecord[] = [];

        // R173-4: Branch for Tier 4 (Writer) — paper section drafting
        if (tier === 4) {
          const writerResult = await runWriter({
            userMessage: userText,
            tenantId,
            sectionType: 'auto',
            onSearchComplete: (paperCount) => {
              send({ type: 'rag_search_complete', paperCount });
            },
            onTextDelta: (delta) => {
              fullText += delta;
              send({ type: 'text_delta', delta });
            }
          });

          fullText = writerResult.draft;
          totalUsage = writerResult.totalCost;
          // R276: deterministic grounding — surface fabricated citations + numbers.
          if (writerResult.grounding.totalWarnings > 0) {
            logger.warn('writer_grounding_warnings', {
              tenantId,
              invalidCitations: writerResult.grounding.invalidCitations,
              unverifiedNumberCount: writerResult.grounding.unverifiedNumbers.length
            });
          }
          send({
            type: 'writer_complete',
            section: writerResult.section,
            citationCount: writerResult.citations.length,
            sourceCount: writerResult.sourceCount,
            invalidCitations: writerResult.grounding.invalidCitations,
            unverifiedNumberCount: writerResult.grounding.unverifiedNumbers.length
          });

          // R238b: tier-4 (Writer) is a self-contained pipeline. Persist + record +
          // provenance + title HERE and return, so it no longer falls through to the
          // branch-B tool loop — which previously re-ran the LLM, doubling cost and
          // concatenating a second answer onto the draft.
          const latencyMs = Date.now() - startedAt;
          const { FieldValue } = await import('firebase-admin/firestore');
          const batchT4 = db.batch();
          batchT4.set(convRef.collection('messages').doc(assistantMessageId), {
            role: 'assistant',
            content: fullText,
            createdAt: Timestamp.now(),
            tier
          });
          batchT4.update(convRef, {
            updatedAt: Timestamp.now(),
            messageCount: FieldValue.increment(2),
            'totalCost.inputTokens': FieldValue.increment(totalUsage.inputTokens),
            'totalCost.outputTokens': FieldValue.increment(totalUsage.outputTokens),
            'totalCost.cacheReadTokens': FieldValue.increment(totalUsage.cacheReadTokens),
            'totalCost.cacheWriteTokens': FieldValue.increment(totalUsage.cacheWriteTokens),
            'totalCost.usd': FieldValue.increment(totalUsage.usd + intentDecision.classifierCostUsd)
          });
          await batchT4.commit();

          send({
            type: 'message_complete',
            usage: totalUsage,
            messageId: assistantMessageId
          });

          // ADR-035 M2: fact extraction post-commit (after() = Vercel-safe).
          if (memoryEnabled) {
            const _userTurnT4 = userText;
            const _assistantTurnT4 = fullText;
            const _msgIdT4 = assistantMessageId;
            const _convIdT4 = conversationId!;
            after(async () => {
              await extractFactsAsync({
                tenantId: tenantId!,
                userId,
                conversationId: _convIdT4,
                sourceMessageId: _msgIdT4,
                userTurn: _userTurnT4,
                assistantTurn: _assistantTurnT4
              });
            });
          }

          // R238a AI-PERF-6: cost + provenance off the response path via after().
          after(async () => {
            try {
              await recordCost({
                tenantId,
                tier,
                capability: getCapabilityForTier(tier),
                feature: intentDecision.feature,
                costUsd: totalUsage.usd,
                inputTokens: totalUsage.inputTokens,
                outputTokens: totalUsage.outputTokens,
                latencyMs
              });
            } catch (e) {
              logger.warn('recordCost_failed', { tenantId, error: String(e) });
            }
            try {
              await writeProvenance({
                tenantId,
                userId,
                userEmail,
                conversationId: conversationId!,
                messageId: assistantMessageId,
                tier,
                model: config.model,
                provider: provider.id === 'anthropic' ? 'anthropic-direct' : 'gcp-vertex',
                region: provider.region,
                toolsCalled: [],
                ragChunksUsed: [],
                reflectionIterations: 0,
                cost: totalUsage,
                latencyMs,
                timestamp: Date.now(),
                intentDecision: {
                  reason: intentDecision.reason,
                  confidence: intentDecision.confidence,
                  classifierCostUsd: intentDecision.classifierCostUsd,
                  classifierLatencyMs: intentDecision.classifierLatencyMs
                }
              });
            } catch (e) {
              logger.warn('provenance_write_failed', { tenantId, error: String(e) });
            }
          });

          // R238a AI-PERF-7: title started concurrently — await ~free; defer write.
          if (titlePromise) {
            const title = await titlePromise;
            if (title) {
              send({ type: 'title_update', conversationId: conversationId!, title });
              after(() => convRef.update({ title }).catch(() => undefined));
            }
          }
          return;
        }

        // Branch for Tier 3 (Sonnet) reflection
        if (tier === 3) {
          const reflectionHistory: Array<{
            round: number;
            response: string;
            critique: {
              sufficient: boolean;
              issues: string[];
              summary: string;
            };
          }> = [];

          const result = await runReflection({
            userMessage: userText,
            onRoundStart: (round) => {
              send({ type: 'reflection_start', round });
            },
            onResetDraft: () => {
              // AI-12: a new reflection round is about to stream — clear the
              // accumulated draft both server-side (fullText) and on the client
              // so round N+1 replaces round N instead of appending onto it.
              fullText = '';
              send({ type: 'reset_draft' });
            },
            onFinalDelta: (delta) => {
              fullText += delta;
              send({ type: 'text_delta', delta });
            },
            onRoundComplete: (round) => {
              reflectionHistory.push({
                round: round.round,
                response: round.response,
                critique: {
                  sufficient: round.critique.sufficient,
                  issues: round.critique.issues,
                  summary: round.critique.summary
                }
              });
              send({
                type: 'reflection_round_complete',
                round: round.round,
                response: round.response,
                critique: {
                  sufficient: round.critique.sufficient,
                  issues: round.critique.issues,
                  summary: round.critique.summary
                }
              });
            }
          });

          fullText = result.finalResponse;
          totalUsage = result.totalCost;
          const latencyMs = Date.now() - startedAt;

          // R241-h3-atomic: assistant message + conversation aggregate commit
          // together in one WriteBatch so a partial failure cannot leave the
          // message persisted while messageCount/totalCost drift behind.
          const { FieldValue } = await import('firebase-admin/firestore');
          const batchA = db.batch();
          batchA.set(convRef.collection('messages').doc(assistantMessageId), {
            role: 'assistant',
            content: fullText,
            createdAt: Timestamp.now(),
            tier,
            reflectionHistory
          });
          batchA.update(convRef, {
            updatedAt: Timestamp.now(),
            messageCount: FieldValue.increment(2),
            'totalCost.inputTokens': FieldValue.increment(totalUsage.inputTokens),
            'totalCost.outputTokens': FieldValue.increment(totalUsage.outputTokens),
            'totalCost.cacheReadTokens': FieldValue.increment(totalUsage.cacheReadTokens),
            'totalCost.cacheWriteTokens': FieldValue.increment(totalUsage.cacheWriteTokens),
            'totalCost.usd': FieldValue.increment(totalUsage.usd + intentDecision.classifierCostUsd)
          });
          await batchA.commit();

          // ADR-035 M2: extract user facts AFTER the response (guaranteed to run
          // via after(), unlike bare fire-and-forget which Vercel would kill).
          // Scheduled post-commit so we never extract from an unpersisted message.
          if (memoryEnabled) {
            const _userTurn = userText;
            const _assistantTurn = fullText;
            const _msgId = assistantMessageId;
            const _convId = conversationId!;
            after(async () => {
              await extractFactsAsync({
                tenantId: tenantId!,
                userId,
                conversationId: _convId,
                sourceMessageId: _msgId,
                userTurn: _userTurn,
                assistantTurn: _assistantTurn
              });
            });
          }

          send({
            type: 'message_complete',
            usage: totalUsage,
            messageId: assistantMessageId
          });

          // R238a AI-PERF-6: cost telemetry + provenance are non-user-visible
          // writes. Schedule them via after() (guaranteed to run on Vercel, unlike
          // bare fire-and-forget which the platform would kill on response close)
          // so they no longer block message_complete. recordCost feeds Cost Guard;
          // the post-response quota-lag window is negligible for a soft pre-check.
          after(async () => {
            try {
              await recordCost({
                tenantId,
                tier,
                capability: getCapabilityForTier(tier),
                feature: intentDecision.feature, // R170-2: per-feature attribution
                costUsd: totalUsage.usd,
                inputTokens: totalUsage.inputTokens,
                outputTokens: totalUsage.outputTokens,
                latencyMs,
                unverifiedNumbers: groundingForTelemetry?.unverifiedNumbers ?? 0,
                unsourcedClaims: groundingForTelemetry?.unsourcedClaims ?? 0
              });
            } catch (e) {
              logger.warn('recordCost_failed', { tenantId, error: String(e) });
            }
            try {
              await writeProvenance({
                tenantId,
                userId,
                userEmail,
                conversationId: conversationId!,
                messageId: assistantMessageId,
                tier,
                model: config.model,
                provider: provider.id === 'anthropic' ? 'anthropic-direct' : 'gcp-vertex',
                region: provider.region,
                toolsCalled: [],
                ragChunksUsed: [],
                reflectionIterations: result.iterations,
                cost: totalUsage,
                latencyMs,
                timestamp: Date.now(),
                intentDecision: {
                  reason: intentDecision.reason,
                  confidence: intentDecision.confidence,
                  classifierCostUsd: intentDecision.classifierCostUsd,
                  classifierLatencyMs: intentDecision.classifierLatencyMs
                }
              });
            } catch (e) {
              logger.warn('provenance_write_failed', { tenantId, error: String(e) });
            }
          });

          // R238a AI-PERF-7: title was started concurrently above — await is ~free.
          // Push it live via SSE, then defer the Firestore write via after().
          if (titlePromise) {
            const title = await titlePromise;
            if (title) {
              send({ type: 'title_update', conversationId: conversationId!, title });
              after(() => convRef.update({ title }).catch(() => undefined));
            }
          }
          return;
        }

        // R160-ai-5e-1c: Multi-turn — past messages for context. R238a AI-PERF-1:
        // the read was kicked off concurrently with the classifiers (top of
        // handler), so this await is ~free here. Already guarded (.catch → []).
        const priorHistory: LLMMessage[] = await historyPromise;
        // ADR-036: load image attachments -> base64 blocks for the current user turn
        const imageBlocks = await Promise.all(
          safeAttachments.map(async (a) => {
            const buf = await downloadBuffer(a.storagePath);
            return {
              type: 'image' as const,
              mimeType: a.mimeType,
              data: buf.toString('base64')
            };
          })
        );
        const currentUserContent =
          imageBlocks.length > 0
            ? [{ type: 'text' as const, text: userText }, ...imageBlocks]
            : userText;

        // Multi-round conversation: each round may emit tool_use → execute → feed back
        let conversationMessages: LLMMessage[] = [
          ...priorHistory,
          { role: 'user', content: currentUserContent }
        ];
        let pendingToolResults:
          | Array<{ toolCallId: string; result: unknown; isError?: boolean }>
          | undefined;
        let round = 0;

        // ADR-035 M1: assemble system prompt with L3 (prefs) + L4 (tenant)
        // memory, plus the dynamic scoped-paper block. Built once per turn.
        const systemBlocks = await buildSystemPromptWithMemory(LABYRA_SYSTEM_PROMPT, {
          userId,
          tenantId: tenantId!,
          toolsBlock: LABYRA_TOOLS_BLOCK,
          dynamicBlock: scopeSystemBlock,
          enableMemory: memoryEnabled
        });

        while (round < MAX_TOOL_ROUNDS) {
          round++;
          const pendingCalls: LLMToolCall[] = [];
          let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';
          let roundText = '';

          for await (const event of provider.streamChat({
            model: config.model,
            maxTokens: 2048,
            system: systemBlocks,
            messages: conversationMessages,
            tools: toolDefinitions,
            toolResults: pendingToolResults
          })) {
            if (event.type === 'text_delta') {
              const cleanDelta = stripVietnameseDollar(event.delta);
              roundText += cleanDelta;
              fullText += cleanDelta;
              send({ type: 'text_delta', delta: cleanDelta });
            } else if (event.type === 'tool_use') {
              pendingCalls.push(event.toolCall);
              send({
                type: 'tool_call',
                toolCallId: event.toolCall.id,
                toolName: event.toolCall.name,
                input: event.toolCall.input
              });
            } else if (event.type === 'message_complete') {
              totalUsage = addUsage(totalUsage, event.usage);
              stopReason = event.stopReason ?? 'end_turn';
            } else if (event.type === 'error') {
              send({ type: 'error', message: event.message });
              return;
            }
          }

          // No tool calls → done
          if (stopReason !== 'tool_use' || pendingCalls.length === 0) {
            break;
          }

          // Execute tools in parallel
          const results = await Promise.all(
            pendingCalls.map((call) =>
              // R188-4 phase1 (T-1): hybrid RAG search legitimately takes 5-15s
              // (cold start up to ~25s) -> 20s was too aggressive. Raise to 45s.
              // A per-tool timeout must NOT reject the whole batch (Promise.all) and
              // kill the chat turn -> convert to error ToolResult with a graceful,
              // user-facing message so the turn survives (no empty "..." bubble).
              withTimeout(
                executeToolCall(call, {
                  tenantId: tenantId!,
                  userId,
                  selectedPaperIds,
                  viewerGroupId,
                  isPrivileged
                }),
                45_000
              ).catch((e) => ({
                toolCallId: call.id,
                toolName: call.name,
                result: {
                  error:
                    e instanceof Error && e.message === 'tool_timeout'
                      ? 'search_timeout'
                      : e instanceof Error
                        ? e.message
                        : 'tool_error',
                  message:
                    'Tìm kiếm tài liệu mất nhiều thời gian hơn dự kiến. Hệ thống đang được tối ưu — vui lòng thử lại sau giây lát.'
                },
                isError: true
              }))
            )
          );

          // Track + emit results
          for (let i = 0; i < pendingCalls.length; i++) {
            const call = pendingCalls[i];
            const result = results[i];
            toolCallRecords.push({
              id: call.id,
              name: call.name,
              input: call.input,
              result: result.result,
              isError: result.isError,
              // R176-3c: persist Gemini 3 thoughtSignature so reloaded conversations
              // can resend matching thought_signature (else 400 INVALID_ARGUMENT).
              // Conditional spread: never write `undefined` to Firestore.
              ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {})
            });
            send({
              type: 'tool_result',
              toolCallId: call.id,
              toolName: call.name,
              result: result.result,
              isError: result.isError ?? false
            });
          }

          // Update conversation context for next round
          // For Anthropic: insert assistant turn containing BOTH text and tool_use blocks.
          // Our provider abstraction handles tool_result via the toolResults param.
          // Hotfix R160-ai-5d-3: include tool_use blocks (Anthropic requires matching tool_use_id).
          type AssistantBlock =
            | { type: 'text'; text: string }
            | {
                type: 'tool_use';
                id: string;
                name: string;
                input: Record<string, unknown>;
                thoughtSignature?: string;
              };
          const assistantBlocks: AssistantBlock[] = [];
          if (roundText.trim().length > 0) {
            assistantBlocks.push({ type: 'text', text: roundText });
          }
          for (const call of pendingCalls) {
            assistantBlocks.push({
              type: 'tool_use',
              id: call.id,
              name: call.name,
              input: call.input,
              ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {})
            });
          }
          // Build tool_result blocks for the user turn following this assistant
          const toolResultBlocks = results.map((r) => ({
            type: 'tool_result' as const,
            tool_use_id: r.toolCallId,
            content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
            is_error: r.isError ?? false
          }));
          conversationMessages = [
            ...conversationMessages,
            {
              role: 'assistant',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content: assistantBlocks as any
            },
            {
              role: 'user',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content: toolResultBlocks as any
            }
          ];
          // Clear pendingToolResults — they're now embedded in conversationMessages
          pendingToolResults = undefined;
        }

        // R160-ai-5e-1: grounding check on final response
        try {
          const chunks = toolCallRecords
            .filter((tc) => tc.name === 'searchPapers')
            .flatMap((tc) => {
              const result = tc.result as { hits?: Array<{ excerpt: string }> } | undefined;
              return result?.hits?.map((h) => ({ text: h.excerpt })) ?? [];
            });
          const grounding = checkGrounding(fullText, chunks);
          if (grounding.totalWarnings > 0) {
            // R170-4: capture for telemetry aggregate
            groundingForTelemetry = {
              unverifiedNumbers: grounding.unverifiedNumbers.length,
              unsourcedClaims: grounding.unsourcedClaims.length
            };
            send({
              type: 'grounding',
              unverifiedNumbers: grounding.unverifiedNumbers.length,
              unsourcedClaims: grounding.unsourcedClaims.length,
              details: {
                numbers: grounding.unverifiedNumbers.slice(0, 5),
                claims: grounding.unsourcedClaims.slice(0, 5)
              }
            });
          }
        } catch (err) {
          console.error('grounding_check_failed', err);
        }

        const latencyMs = Date.now() - startedAt;

        // R241-h3-atomic: assistant message + conversation aggregate commit
        // together in one WriteBatch (atomic; no drift on partial failure).
        const { FieldValue } = await import('firebase-admin/firestore');
        const batchB = db.batch();
        batchB.set(convRef.collection('messages').doc(assistantMessageId), {
          role: 'assistant',
          content: fullText,
          createdAt: Timestamp.now(),
          tier,
          ...(toolCallRecords.length > 0 ? { toolCalls: toolCallRecords } : {})
        });
        batchB.update(convRef, {
          updatedAt: Timestamp.now(),
          messageCount: FieldValue.increment(2),
          'totalCost.inputTokens': FieldValue.increment(totalUsage.inputTokens),
          'totalCost.outputTokens': FieldValue.increment(totalUsage.outputTokens),
          'totalCost.cacheReadTokens': FieldValue.increment(totalUsage.cacheReadTokens),
          'totalCost.cacheWriteTokens': FieldValue.increment(totalUsage.cacheWriteTokens),
          'totalCost.usd': FieldValue.increment(totalUsage.usd + intentDecision.classifierCostUsd)
        });
        await batchB.commit();

        // ADR-035 M2 (R197c): fact extraction cho TIER THƯỜNG (T0/T1/T2).
        // Bug gốc: khối này trước đây CHỈ ở nhánh tier===3, nên chat thường
        // không bao giờ extract fact. Scheduled post-commit (after()).
        if (memoryEnabled) {
          const _userTurn2 = userText;
          const _assistantTurn2 = fullText;
          const _msgId2 = assistantMessageId;
          const _convId2 = conversationId!;
          after(async () => {
            await extractFactsAsync({
              tenantId: tenantId!,
              userId,
              conversationId: _convId2,
              sourceMessageId: _msgId2,
              userTurn: _userTurn2,
              assistantTurn: _assistantTurn2
            });
          });
        }

        send({
          type: 'message_complete',
          usage: totalUsage,
          messageId: assistantMessageId
        });

        // R238a AI-PERF-6: provenance is a non-user-visible lineage write — defer
        // via after() (Vercel-safe) so it stops blocking message_complete.
        const provToolsCalled = toolCallRecords.map((r) => ({
          id: r.id,
          name: r.name,
          inputJson: JSON.stringify(r.input)
        }));
        after(async () => {
          // R238b: branch B (tiers 0/1/2 — incl. all T2 RAG) previously never called
          // recordCost, so _costs/{date} only ever saw tier-3 spend and Cost Guard +
          // the cost reports undercounted everything else. Record it here (post-
          // response, alongside provenance).
          try {
            await recordCost({
              tenantId,
              tier,
              capability: getCapabilityForTier(tier),
              feature: intentDecision.feature,
              costUsd: totalUsage.usd,
              inputTokens: totalUsage.inputTokens,
              outputTokens: totalUsage.outputTokens,
              latencyMs,
              unverifiedNumbers: groundingForTelemetry?.unverifiedNumbers ?? 0,
              unsourcedClaims: groundingForTelemetry?.unsourcedClaims ?? 0
            });
          } catch (e) {
            logger.warn('recordCost_failed', { tenantId, error: String(e) });
          }
          try {
            await writeProvenance({
              tenantId,
              userId,
              userEmail,
              conversationId: conversationId!,
              messageId: assistantMessageId,
              tier,
              model: config.model,
              provider: provider.id === 'anthropic' ? 'anthropic-direct' : 'gcp-vertex',
              region: provider.region,
              toolsCalled: provToolsCalled,
              ragChunksUsed: [],
              reflectionIterations: 0,
              cost: totalUsage,
              latencyMs,
              timestamp: Date.now(),
              intentDecision: {
                reason: intentDecision.reason,
                confidence: intentDecision.confidence,
                classifierCostUsd: intentDecision.classifierCostUsd,
                classifierLatencyMs: intentDecision.classifierLatencyMs
              }
            });
          } catch (e) {
            logger.warn('provenance_write_failed', { tenantId, error: String(e) });
          }
        });

        // R238a AI-PERF-7: title started concurrently above — await ~free, push
        // live via SSE, defer the Firestore write via after().
        if (titlePromise) {
          const title = await titlePromise;
          if (title) {
            send({ type: 'title_update', conversationId: conversationId!, title });
            after(() => convRef.update({ title }).catch(() => undefined));
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown_error';
        send({ type: 'error', message: msg });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    }
  });
}
