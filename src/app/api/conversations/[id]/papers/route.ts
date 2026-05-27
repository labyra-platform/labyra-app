/**
 * PATCH /api/conversations/[id]/papers
 *
 * Update selectedPaperIds for a conversation (RAG scoping).
 *
 * Body: { paperIds: string[] }
 *
 * Validation:
 * - Caller owns the conversation (userId match)
 * - Max 10 paperIds
 * - Each paperId must exist in caller's tenant
 *
 * @phase R178-2a
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromToken, getRoleFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const MAX_PAPERS_PER_CONVERSATION = 10;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: conversationId } = await params;
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new NextResponse('unauthorized', { status: 401 });
    }
    const decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
    const tenantId = getTenantIdFromToken(decoded);
    const role = getRoleFromToken(decoded);
    if (role === 'viewer' || role === null) {
      return new NextResponse('forbidden_viewer', { status: 403 });
    }
    if (!tenantId) {
      return new NextResponse('no_tenant', { status: 403 });
    }
    const userId = decoded.uid;

    // Rate limit: 30 mutations/min per tenant
    const rl = await checkRateLimit(rateLimitKey('conv-papers-patch', tenantId), 30, 60);
    if (!rl.allowed) {
      return new NextResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(rl.resetSec) }
      });
    }

    let body: { paperIds?: unknown };
    try {
      body = (await req.json()) as { paperIds?: unknown };
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const rawPaperIds = body.paperIds;
    if (!Array.isArray(rawPaperIds)) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'paperIds must be an array' } },
        { status: 400 }
      );
    }
    // AI-18: dedupe FIRST, then length-check the deduped array. Checking
    // rawPaperIds.length before dedup wrongly rejects a valid ≤10 unique
    // selection that happens to contain client-side duplicates (raw length > 10).
    const paperIds = Array.from(
      new Set(rawPaperIds.filter((p): p is string => typeof p === 'string' && p.length > 0))
    );
    if (paperIds.length > MAX_PAPERS_PER_CONVERSATION) {
      return NextResponse.json(
        {
          error: {
            code: 'TOO_MANY_PAPERS',
            message: `Maximum ${MAX_PAPERS_PER_CONVERSATION} papers per conversation`
          }
        },
        { status: 400 }
      );
    }

    const db = getAdminFirestoreService();
    const convRef = db.doc(`tenants/${tenantId}/aiConversations/${conversationId}`);
    const convSnap = await convRef.get();
    if (!convSnap.exists) {
      return new NextResponse('conversation_not_found', { status: 404 });
    }
    const convData = convSnap.data() as { userId: string };
    if (convData.userId !== userId) {
      return new NextResponse('forbidden', { status: 403 });
    }

    // Verify each paperId exists in tenant (defense in depth)
    if (paperIds.length > 0) {
      const paperRefs = paperIds.map((pid) => db.doc(`tenants/${tenantId}/papers/${pid}`));
      const snaps = await db.getAll(...paperRefs);
      const missing = snaps
        .map((s, i) => (s.exists ? null : paperIds[i]))
        .filter((p): p is string => p !== null);
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: {
              code: 'PAPER_NOT_FOUND',
              message: `Papers not found: ${missing.join(', ')}`
            }
          },
          { status: 404 }
        );
      }
    }

    await convRef.update({
      selectedPaperIds: paperIds,
      updatedAt: Date.now()
    });

    return NextResponse.json({ data: { selectedPaperIds: paperIds } });
  } catch (err) {
    console.error('PATCH conversations/[id]/papers error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', {
      status: 500
    });
  }
}
