/**
 * API: POST /api/materials — create new Material
 * @phase R160-data-1
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { getAdminFirestoreService } from '@/lib/firebase/admin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new NextResponse('unauthorized', { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length);
    const decoded = await getAdminAuthService().verifyIdToken(token);
    const tenantId = decoded.tenantId as string | undefined;
    if (!tenantId) {
      return new NextResponse('no_tenant', { status: 403 });
    }
    const data = await req.json();
    const db = getAdminFirestoreService();
    const colRef = db.collection(`tenants/${tenantId}/materials`);
    const docRef = colRef.doc();
    const now = Date.now();
    await docRef.set({
      ...data,
      id: docRef.id,
      tenantId,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: decoded.uid,
      preparedAt: data.preparedAt ?? now
    });
    return NextResponse.json({ id: docRef.id });
  } catch (err) {
    console.error('POST /materials error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', { status: 500 });
  }
}
