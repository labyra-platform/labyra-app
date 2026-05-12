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
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { selectProvider } from '@/lib/ai/providers';
import { classifyIntent } from '@/lib/ai/dispatcher/intent-classifier';
import { LABYRA_SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { writeProvenance } from '@/lib/ai/provenance-writer';
import { generateConversationTitle } from '@/lib/ai/title-generator';
import { getToolDefinitions } from '@/lib/ai/tools/registry';
import { executeToolCall } from '@/lib/ai/tools/dispatch';
import type { ChatRequestBodyV2, ChatStreamEventV2, AiTier, AiCostBreakdown } from '@/types/ai';
import type { LLMMessage, LLMToolCall } from '@/lib/ai/providers/types';

export const runtime = 'nodejs';

const MAX_TOOL_ROUNDS = 3;

interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
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

  const tenantId = (decoded.tenantId as string | undefined) ?? null;
  const userId = decoded.uid;
  const userEmail = decoded.email ?? '';
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'missing_tenant_claim' }), {
      status: 403,
      headers: { 'content-type': 'application/json' }
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
  }

  const convRef = tenantRef.collection('aiConversations').doc(conversationId);

  // Save user message
  const userMessageRef = convRef.collection('messages').doc();
  await userMessageRef.set({
    role: 'user',
    content: userText,
    createdAt: now,
    userId
  });

  // Tier dispatch
  const intentDecision = await classifyIntent(userText);
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
        send({ type: 'message_start', messageId: assistantMessageId });

        let fullText = '';
        let totalUsage: AiCostBreakdown = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          usd: 0
        };
        const toolCallRecords: ToolCallRecord[] = [];

        // Multi-round conversation: each round may emit tool_use → execute → feed back
        let conversationMessages: LLMMessage[] = [{ role: 'user', content: userText }];
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
            system: [{ text: LABYRA_SYSTEM_PROMPT, cache: true, cacheTtl: '1h' }],
            messages: conversationMessages,
            tools: toolDefinitions,
            toolResults: pendingToolResults
          })) {
            if (event.type === 'text_delta') {
              roundText += event.delta;
              fullText += event.delta;
              send({ type: 'text_delta', delta: event.delta });
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
            pendingCalls.map((call) => executeToolCall(call, { tenantId: tenantId!, userId }))
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
          // For Anthropic: insert assistant turn with tool_use, then user turn with tool_result.
          // Our provider abstraction handles tool_result via the toolResults param.
          // We need to also include the assistant tool_use turn in messages for context.
          conversationMessages = [
            ...conversationMessages,
            {
              role: 'assistant',
              content: roundText || '[tool calls]'
            }
          ];
          pendingToolResults = results.map((r) => ({
            toolCallId: r.toolCallId,
            result: r.result,
            isError: r.isError
          }));
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
          toolsCalled: toolCallRecords.map((r) => r.name),
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
            send({ type: 'title_update', conversationId: conversationId!, title });
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
