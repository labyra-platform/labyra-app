/**
 * POST /api/chat — Streaming chat endpoint v3.
 *
 * R160-ai-3a: Uses LLMProvider abstraction. Behavior unchanged — still routes
 * all traffic through Tier 2 (Sonnet 4.6). Tier dispatching ships in ai-3b.
 *
 * @phase R160-ai-3a
 */
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { selectProvider } from '@/lib/ai/providers';
import { LABYRA_SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { writeProvenance } from '@/lib/ai/provenance-writer';
import { generateConversationTitle } from '@/lib/ai/title-generator';
import type { ChatRequestBodyV2, ChatStreamEventV2 } from '@/types/ai';

export const runtime = 'nodejs';

const HARDCODED_TIER = 2; // ai-3a: still 100% Sonnet. ai-3b will dispatch.

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

  // ─── 2. Body ──────────────────────────────────────────────────────
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

  // ─── 3. Conversation get-or-create ────────────────────────────────
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

  // ─── 4. Stream via provider abstraction ───────────────────────────
  const { provider, config } = selectProvider(HARDCODED_TIER);
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

        let fullText = '';
        let finalUsage = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          usd: 0
        };

        for await (const event of provider.streamChat({
          model: config.model,
          maxTokens: 2048,
          system: [{ text: LABYRA_SYSTEM_PROMPT, cache: true, cacheTtl: '1h' }],
          messages: [{ role: 'user', content: userText }]
        })) {
          if (event.type === 'text_delta') {
            fullText += event.delta;
            send({ type: 'text_delta', delta: event.delta });
          } else if (event.type === 'message_complete') {
            finalUsage = event.usage;
          } else if (event.type === 'error') {
            send({ type: 'error', message: event.message });
            return;
          }
        }

        const latencyMs = Date.now() - startedAt;

        // Save assistant message
        await convRef.collection('messages').doc(assistantMessageId).set({
          role: 'assistant',
          content: fullText,
          createdAt: Timestamp.now()
        });

        // Update conversation aggregate (atomic increments)
        const { FieldValue } = await import('firebase-admin/firestore');
        await convRef.update({
          updatedAt: Timestamp.now(),
          messageCount: FieldValue.increment(2),
          'totalCost.inputTokens': FieldValue.increment(finalUsage.inputTokens),
          'totalCost.outputTokens': FieldValue.increment(finalUsage.outputTokens),
          'totalCost.cacheReadTokens': FieldValue.increment(finalUsage.cacheReadTokens),
          'totalCost.cacheWriteTokens': FieldValue.increment(finalUsage.cacheWriteTokens),
          'totalCost.usd': FieldValue.increment(finalUsage.usd)
        });

        // Provenance audit
        await writeProvenance({
          tenantId,
          userId,
          userEmail,
          conversationId: conversationId!,
          messageId: assistantMessageId,
          tier: HARDCODED_TIER,
          model: config.model,
          provider: provider.id === 'anthropic' ? 'anthropic-direct' : 'gcp-vertex',
          region: provider.region,
          toolsCalled: [],
          ragChunksUsed: [],
          reflectionIterations: 0,
          cost: finalUsage,
          latencyMs,
          timestamp: Date.now()
        });

        send({
          type: 'message_complete',
          usage: finalUsage,
          messageId: assistantMessageId
        });

        // Title gen for new conversations (non-blocking failure)
        if (isNewConversation) {
          try {
            const title = await generateConversationTitle(userText);
            await convRef.update({ title });
            send({ type: 'title_update', conversationId: conversationId!, title });
          } catch {
            // keep 'Untitled'
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
