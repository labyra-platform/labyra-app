/**
 * POST /api/chat — Streaming chat endpoint v2.
 *
 * Phase R160-ai-2a additions:
 * - Auto-create conversation if conversationId missing
 * - Save user message + assistant response to Firestore
 * - Write provenance record after completion
 * - Generate title async after first response (Haiku 4.5)
 *
 * @phase R160-ai-2a
 */
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { getAnthropicClient, MODELS } from '@/lib/anthropic/client';
import { SYSTEM_BLOCKS_CACHED } from '@/lib/ai/system-prompt';
import { writeProvenance } from '@/lib/ai/provenance-writer';
import { generateConversationTitle } from '@/lib/ai/title-generator';
import type { ChatRequestBodyV2, ChatStreamEventV2 } from '@/types/ai';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  // ─── 1. Auth ──────────────────────────────────────────────────────
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
    return new Response(
      JSON.stringify({ error: 'missing_tenant_claim', hint: 'Refresh auth claims' }),
      { status: 403, headers: { 'content-type': 'application/json' } }
    );
  }

  // ─── 2. Body parse ────────────────────────────────────────────────
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

  // ─── 3. Conversation: get-or-create ──────────────────────────────
  let conversationId = body.conversationId;
  let isNewConversation = false;
  const now = Timestamp.now();

  const tenantRef = db.collection('tenants').doc(tenantId);

  if (!conversationId) {
    isNewConversation = true;
    const newConvRef = tenantRef.collection('aiConversations').doc();
    conversationId = newConvRef.id;
    await newConvRef.set({
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

  // ─── 4. Stream Anthropic response ─────────────────────────────────
  const anthropic = getAnthropicClient();
  const assistantMessageId = convRef.collection('messages').doc().id;
  const startedAt = Date.now();

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

        const response = await anthropic.messages.stream({
          model: MODELS.tier2,
          max_tokens: 2048,
          system: SYSTEM_BLOCKS_CACHED,
          messages: [{ role: 'user', content: userText }]
        });

        let fullText = '';
        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const delta = event.delta.text;
            fullText += delta;
            send({ type: 'text_delta', delta });
          }
        }

        const final = await response.finalMessage();
        const usage = final.usage;
        const cost = estimateCost(usage);
        const latencyMs = Date.now() - startedAt;

        // Save assistant message
        await convRef.collection('messages').doc(assistantMessageId).set({
          role: 'assistant',
          content: fullText,
          createdAt: Timestamp.now()
        });

        // Update conversation aggregate
        await convRef.set(
          {
            updatedAt: Timestamp.now(),
            messageCount: (isNewConversation ? 0 : 0) + 2 // overwrite; we'll fix increment below
          },
          { merge: true }
        );
        // Use FieldValue.increment for proper atomic increment
        const { FieldValue } = await import('firebase-admin/firestore');
        await convRef.update({
          messageCount: FieldValue.increment(2),
          'totalCost.inputTokens': FieldValue.increment(usage.input_tokens),
          'totalCost.outputTokens': FieldValue.increment(usage.output_tokens),
          'totalCost.cacheReadTokens': FieldValue.increment(usage.cache_read_input_tokens ?? 0),
          'totalCost.cacheWriteTokens': FieldValue.increment(
            usage.cache_creation_input_tokens ?? 0
          ),
          'totalCost.usd': FieldValue.increment(cost)
        });

        // Write provenance (audit trail)
        await writeProvenance({
          tenantId,
          userId,
          userEmail,
          conversationId: conversationId!,
          messageId: assistantMessageId,
          tier: 2,
          model: MODELS.tier2,
          provider: 'anthropic-direct',
          region: 'us-east-1',
          toolsCalled: [],
          ragChunksUsed: [],
          reflectionIterations: 0,
          cost: {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            cacheReadTokens: usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
            usd: cost
          },
          latencyMs,
          timestamp: Date.now()
        });

        send({
          type: 'message_complete',
          usage: {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            cacheReadTokens: usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
            usd: cost
          },
          messageId: assistantMessageId
        });

        // Title generation (only for new conversations, after stream completes)
        if (isNewConversation) {
          try {
            const title = await generateConversationTitle(userText);
            await convRef.update({ title });
            send({ type: 'title_update', conversationId: conversationId!, title });
          } catch (e) {
            // Title gen failed — keep 'Untitled', not critical
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

/** Sonnet 4.6 pricing: $3/M in, $15/M out, cache_read 10% of input, cache_write 1.25x input */
function estimateCost(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): number {
  const inputUsd = (usage.input_tokens / 1_000_000) * 3;
  const outputUsd = (usage.output_tokens / 1_000_000) * 15;
  const cacheReadUsd = ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * 0.3;
  const cacheWriteUsd = ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * 3.75;
  return Number((inputUsd + outputUsd + cacheReadUsd + cacheWriteUsd).toFixed(6));
}
