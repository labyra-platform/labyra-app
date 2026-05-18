/**
 * GET /api/superadmin/evals — Ragas evaluation results across tenants.
 *
 * Query params:
 *   ?week=YYYY-Www  (default: latest week with data)
 *
 * @phase R172-3
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/auth/superadmin-guard';
import { getAdminFirestoreService } from '@/lib/firebase/admin';

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireSuperadmin(request);
  if (!guard.allowed) return guard.response!;

  const url = new URL(request.url);
  const week = url.searchParams.get('week'); // optional

  const db = getAdminFirestoreService();
  const tenantsSnap = await db.collection('tenants').get();

  const tenantSummaries: Array<{
    tenantId: string;
    week: string;
    sampleSize?: number;
    flaggedCount?: number;
    evaluatorCostUsd?: number;
    [key: string]: unknown;
  }> = [];

  const flaggedConversations: Array<{
    tenantId: string;
    week: string;
    conversationId: string;
    overallScore: number;
    flagReasons: string[];
  }> = [];

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const evalsRef = db.collection(`tenants/${tenantId}/_evals`);

    let weekDocs;
    if (week) {
      const doc = await evalsRef.doc(week).get();
      weekDocs = doc.exists ? [doc] : [];
    } else {
      const snap = await evalsRef.orderBy('evaluatedAt', 'desc').limit(4).get();
      weekDocs = snap.docs;
    }

    for (const weekDoc of weekDocs) {
      const data = weekDoc.data();
      tenantSummaries.push({ tenantId, week: weekDoc.id, ...data });

      // Load flagged conversations
      const convsSnap = await db
        .collection(`tenants/${tenantId}/_evals/${weekDoc.id}/conversations`)
        .where('flagged', '==', true)
        .limit(50)
        .get();

      for (const convDoc of convsSnap.docs) {
        const conv = convDoc.data();
        flaggedConversations.push({
          tenantId,
          week: weekDoc.id,
          conversationId: convDoc.id,
          overallScore: conv.overallScore ?? 0,
          flagReasons: conv.flagReasons ?? []
        });
      }
    }
  }

  return NextResponse.json({
    week,
    summaries: tenantSummaries,
    flaggedConversations
  });
}
