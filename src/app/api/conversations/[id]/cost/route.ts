/**
 * GET /api/conversations/[id]/cost — return cost breakdown for a conversation.
 *
 * Tenant-scoped: must match authenticated user's tenant.
 * Returns AiCostBreakdown + message count + timestamps.
 *
 * @phase R170-6 base, R170-hotfix auth fix
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { getTenantIdFromToken } from '@/lib/auth/token';
import type { AiCostBreakdown, AiConversation } from '@/types/ai';

interface CostSummaryResponse {
  conversationId: string;
  totalCost: AiCostBreakdown;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await getAdminAuthService().verifyIdToken(token);
    const tenantId = getTenantIdFromToken(decoded);
    if (!tenantId) {
      return NextResponse.json({ error: 'no_tenant' }, { status: 403 });
    }

    const { id: conversationId } = await params;
    if (!conversationId || conversationId.length > 100) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }

    const db = getAdminFirestoreService();
    const ref = db.doc(`tenants/${tenantId}/aiConversations/${conversationId}`);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const conv = snap.data() as AiConversation;

    const response: CostSummaryResponse = {
      conversationId,
      totalCost: conv.totalCost,
      messageCount: conv.messageCount,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt
    };

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    // eslint-disable-next-line no-console -- API logging
    console.error('[conversation-cost] error:', msg);
    return NextResponse.json({ error: 'server_error', detail: msg }, { status: 500 });
  }
}
