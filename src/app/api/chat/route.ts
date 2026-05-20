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
import { NextResponse } from 'next/server';
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
import { LABYRA_SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { runWriter } from '@/lib/ai/tier4-writer/orchestrator';
import { generateConversationTitle } from '@/lib/ai/title-generator';
import { executeToolCall } from '@/lib/ai/tools/dispatch';
import { getToolDefinitions } from '@/lib/ai/tools/registry';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { AiCostBreakdown, AiTier, ChatRequestBodyV2, ChatStreamEventV2 } from '@/types/ai';

export const runtime = 'nodejs';

const MAX_TOOL_ROUNDS = 3;

interface ToolCallRecord {
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
  const userEmail = decoded.email ?? '';
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'missing_tenant_claim' }), {
      status: 403,
      headers: { 'content-type': 'application/json' }
    });
  }

  // R162-tier-rate-limit — per-tenant rate limit
  const rl = await checkRateLimit(rateLimitKey('chat', tenantId), 5, 60);
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

  // Save user message
  const userMessageRef = convRef.collection('messages').doc();
  await userMessageRef.set({
    role: 'user',
    content: userText,
    createdAt: now,
    userId
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

  // Tier dispatch
  const intentDecision = await classifyIntent(userText);

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
  const tier: AiTier = intentDecision.tier;
  const { provider, config } = selectProvider(tier);

  const assistantMessageId = convRef.collection('messages').doc().id;
  const startedAt = Date.now();
  const toolDefinitions = getToolDefinitions();

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
          send({
            type: 'writer_complete',
            section: writerResult.section,
            citationCount: writerResult.citations.length,
            sourceCount: writerResult.sourceCount
          });
        }

        // Branch for Tier 3 (Opus) reflection
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

          await convRef.collection('messages').doc(assistantMessageId).set({
            role: 'assistant',
            content: fullText,
            createdAt: Timestamp.now(),
            tier,
            reflectionHistory
          });

          const { FieldValue } = await import('firebase-admin/firestore');
          await convRef.update({
            updatedAt: Timestamp.now(),
            messageCount: FieldValue.increment(2),
            'totalCost.inputTokens': FieldValue.increment(totalUsage.inputTokens),
            'totalCost.outputTokens': FieldValue.increment(totalUsage.outputTokens),
            'totalCost.cacheReadTokens': FieldValue.increment(totalUsage.cacheReadTokens),
            'totalCost.cacheWriteTokens': FieldValue.increment(totalUsage.cacheWriteTokens),
            'totalCost.usd': FieldValue.increment(totalUsage.usd + intentDecision.classifierCostUsd)
          });

          // R169-4: cost telemetry (best-effort, non-blocking)

          try {
            await recordCost({
              tenantId,
              tier,
              capability: getCapabilityForTier(tier),
              feature: intentDecision.feature, // R170-2: per-feature attribution
              costUsd: totalUsage.usd,
              // R170-4: extended telemetry
              inputTokens: totalUsage.inputTokens,
              outputTokens: totalUsage.outputTokens,
              latencyMs: Date.now() - startedAt,
              unverifiedNumbers: groundingForTelemetry?.unverifiedNumbers ?? 0,
              unsourcedClaims: groundingForTelemetry?.unsourcedClaims ?? 0
            });
          } catch (e) {
            // eslint-disable-next-line no-console

            console.warn('[chat-route] recordCost failed (non-fatal):', e);
          }

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

          send({
            type: 'message_complete',
            usage: totalUsage,
            messageId: assistantMessageId
          });

          if (isNewConversation) {
            try {
              const title = await generateConversationTitle(userText);
              await convRef.update({ title });
              send({
                type: 'title_update',
                conversationId: conversationId!,
                title
              });
            } catch {
              // keep Untitled
            }
          }
          return;
        }

        // R160-ai-5e-1c: Multi-turn — load past messages from Firestore for context
        let priorHistory: LLMMessage[] = [];
        try {
          priorHistory = await loadConversationHistory(
            tenantId!,
            conversationId!,
            userMessageRef.id // exclude the just-saved pending user message
          );
        } catch (err) {
          console.error('history_load_failed', err);
        }
        // Multi-round conversation: each round may emit tool_use → execute → feed back
        let conversationMessages: LLMMessage[] = [
          ...priorHistory,
          { role: 'user', content: userText }
        ];
        let pendingToolResults:
          | Array<{ toolCallId: string; result: unknown; isError?: boolean }>
          | undefined;
        let round = 0;

        while (round < MAX_TOOL_ROUNDS) {
          round++;
          const pendingCalls: LLMToolCall[] = [];
          let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';
          let roundText = '';

          for await (const event of provider.streamChat({
            model: config.model,
            maxTokens: 2048,
            system: scopeSystemBlock
              ? [
                  { text: LABYRA_SYSTEM_PROMPT, cache: true, cacheTtl: '1h' },
                  { text: scopeSystemBlock, cache: false }
                ]
              : [{ text: LABYRA_SYSTEM_PROMPT, cache: true, cacheTtl: '1h' }],
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
              executeToolCall(call, { tenantId: tenantId!, userId, selectedPaperIds })
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
              isError: result.isError
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

        // Save assistant message with tool calls
        await convRef
          .collection('messages')
          .doc(assistantMessageId)
          .set({
            role: 'assistant',
            content: fullText,
            createdAt: Timestamp.now(),
            tier,
            ...(toolCallRecords.length > 0 ? { toolCalls: toolCallRecords } : {})
          });

        // Conversation aggregate
        const { FieldValue } = await import('firebase-admin/firestore');
        await convRef.update({
          updatedAt: Timestamp.now(),
          messageCount: FieldValue.increment(2),
          'totalCost.inputTokens': FieldValue.increment(totalUsage.inputTokens),
          'totalCost.outputTokens': FieldValue.increment(totalUsage.outputTokens),
          'totalCost.cacheReadTokens': FieldValue.increment(totalUsage.cacheReadTokens),
          'totalCost.cacheWriteTokens': FieldValue.increment(totalUsage.cacheWriteTokens),
          'totalCost.usd': FieldValue.increment(totalUsage.usd + intentDecision.classifierCostUsd)
        });

        // Provenance
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
          toolsCalled: toolCallRecords.map((r) => ({
            id: r.id,
            name: r.name,
            inputJson: JSON.stringify(r.input)
          })),
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

        send({
          type: 'message_complete',
          usage: totalUsage,
          messageId: assistantMessageId
        });

        // Title generation
        if (isNewConversation) {
          try {
            const title = await generateConversationTitle(userText);
            await convRef.update({ title });
            send({
              type: 'title_update',
              conversationId: conversationId!,
              title
            });
          } catch {
            // keep Untitled
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
