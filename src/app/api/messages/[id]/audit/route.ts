/**
 * POST /api/messages/[id]/audit — explicit T5 audit trigger.
 *
 * Request body:
 *   { conversationId: string }
 *
 * Auth: Bearer token. User must own the conversation (tenantId match).
 *
 * Loads the message + its aiProvenance for RAG chunks, then runs T5 audit.
 *
 * @phase R173-5
 */
import 'server-only';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getCapabilityForTier } from '@/lib/ai/config/capabilities';
import { estimateCost } from '@/lib/ai/cost/estimator';
import { recordCost } from '@/lib/ai/cost/telemetry';
import { checkCostGuard } from '@/lib/ai/governance/cost-guard';
import { runAuditor } from '@/lib/ai/tier5-auditor/orchestrator';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

interface RequestBody {
  conversationId: string;
}
// H4: runtime Zod validation
const RequestBodySchema = z.object({ conversationId: z.string().min(1).max(128) });

/**
 * GET /api/messages/[id]/audit?conversationId=X
 *
 * Loads the most recent CACHED audit for this message (no T5 run, no cost).
 * Returns { audit: AuditResult | null }. Same ownership check as POST.
 *
 * @phase R176-5a
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  let tenantId: string | null;
  let callerUid: string;
  let callerRole: string | undefined;
  try {
    const decoded = await getAdminAuthService().verifyIdToken(token);
    tenantId = getTenantIdFromToken(decoded);
    callerUid = decoded.uid;
    callerRole = (decoded as { role?: string }).role;
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 });
  }
  const { id: messageId } = await params;
  const conversationId = new URL(request.url).searchParams.get('conversationId');
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId_required' }, { status: 400 });
  }

  const db = getAdminFirestoreService();
  // Same C6 ownership check as POST: caller must own the conversation (or be
  // admin/superadmin) — tenantId match alone is not sufficient.
  const convSnap = await db.doc(`tenants/${tenantId}/aiConversations/${conversationId}`).get();
  if (!convSnap.exists) {
    return NextResponse.json({ error: 'conversation_not_found' }, { status: 404 });
  }
  const convOwnerId = (convSnap.data() as { userId?: string }).userId;
  const isOwner = convOwnerId === callerUid;
  const isPrivileged = callerRole === 'admin' || callerRole === 'superadmin';
  if (!isOwner && !isPrivileged) {
    return NextResponse.json({ error: 'forbidden_not_owner' }, { status: 403 });
  }

  // Latest cached audit for this message (R176-5a: needs composite index
  // sourceMessageId ASC + evaluatedAt DESC).
  const auditSnap = await db
    .collection(`tenants/${tenantId}/aiAudits`)
    .where('sourceMessageId', '==', messageId)
    .orderBy('evaluatedAt', 'desc')
    .limit(1)
    .get();

  if (auditSnap.empty) {
    return NextResponse.json({ audit: null });
  }
  return NextResponse.json({ audit: auditSnap.docs[0].data() });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // Auth
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  let tenantId: string | null;
  let callerUid: string;
  let callerRole: string | undefined;
  try {
    const decoded = await getAdminAuthService().verifyIdToken(token);
    tenantId = getTenantIdFromToken(decoded);
    callerUid = decoded.uid;
    callerRole = (decoded as { role?: string }).role;
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 });
  }

  // Parse params + body
  const { id: messageId } = await params;
  let body: RequestBody;
  try {
    body = RequestBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const conversationId = body.conversationId;
  if (!conversationId || typeof conversationId !== 'string') {
    return NextResponse.json({ error: 'conversationId_required' }, { status: 400 });
  }

  const db = getAdminFirestoreService();

  // C6: enforce conversation ownership. tenantId match is NOT sufficient — a
  // member could otherwise audit another member's private conversation in the
  // same tenant. Caller must own the conversation, or be admin/superadmin.
  const convRef = db.doc(`tenants/${tenantId}/aiConversations/${conversationId}`);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    return NextResponse.json({ error: 'conversation_not_found' }, { status: 404 });
  }
  const convOwnerId = (convSnap.data() as { userId?: string }).userId;
  const isOwner = convOwnerId === callerUid;
  const isPrivileged = callerRole === 'admin' || callerRole === 'superadmin';
  if (!isOwner && !isPrivileged) {
    return NextResponse.json({ error: 'forbidden_not_owner' }, { status: 403 });
  }

  // Load message
  const msgRef = db.doc(
    `tenants/${tenantId}/aiConversations/${conversationId}/messages/${messageId}`
  );
  const msgSnap = await msgRef.get();
  if (!msgSnap.exists) {
    return NextResponse.json({ error: 'message_not_found' }, { status: 404 });
  }
  const msg = msgSnap.data();
  if (!msg) {
    return NextResponse.json({ error: 'message_not_found' }, { status: 404 });
  }

  const responseText = String(msg.content ?? '');
  if (responseText.length < 50) {
    return NextResponse.json({ error: 'message_too_short', minLength: 50 }, { status: 400 });
  }

  // Load provenance (RAG chunks)
  const provSnap = await db
    .collection(`tenants/${tenantId}/aiProvenance`)
    .where('messageId', '==', messageId)
    .limit(1)
    .get();
  const ragChunks = provSnap.empty
    ? []
    : ((provSnap.docs[0].data().ragChunksUsed ?? []) as Array<{
        paperId: string;
        chunkId: string;
        text?: string;
      }>);

  // Cost Guard pre-check (Tier 5)
  const estimated = estimateCost(5, 'audit');
  const costCheck = await checkCostGuard(tenantId, 5, 'audit', estimated);
  if (!costCheck.allowed) {
    return NextResponse.json(
      {
        error: 'quota_exceeded',
        reason: costCheck.reason,
        dailyCurrent: costCheck.dailyCurrent,
        dailyLimit: costCheck.dailyLimit
      },
      { status: 429 }
    );
  }

  // Run audit
  try {
    const result = await runAuditor({
      tenantId,
      conversationId,
      messageId,
      responseText,
      ragChunks
    });

    // Telemetry
    await recordCost({
      tenantId,
      tier: 5,
      capability: getCapabilityForTier(5),
      feature: 'audit',
      costUsd: result.totalCost.usd,
      inputTokens: result.totalCost.inputTokens,
      outputTokens: result.totalCost.outputTokens,
      latencyMs: result.durationMs
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'audit_failed', detail: msg }, { status: 500 });
  }
}
