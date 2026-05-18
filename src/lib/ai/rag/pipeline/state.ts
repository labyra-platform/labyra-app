/**
 * State machine helpers — Firestore status updates with timestamps.
 * @phase R160-ai-5b-2
 */
import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { PaperStatus } from '@/types/papers';

export async function updatePaperStatus(
  tenantId: string,
  paperId: string,
  status: PaperStatus,
  extraFields: Record<string, unknown> = {}
): Promise<void> {
  const db = getAdminFirestoreService();
  await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
    status,
    statusUpdatedAt: Timestamp.now(),
    ...extraFields
  });
}

export async function setPaperError(
  tenantId: string,
  paperId: string,
  error: string,
  isRetryable: boolean = false
): Promise<void> {
  const db = getAdminFirestoreService();
  if (isRetryable) {
    await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
      error,
      retryCount: FieldValue.increment(1),
      statusUpdatedAt: Timestamp.now()
    });
  } else {
    await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
      status: 'failed' as PaperStatus,
      error,
      statusUpdatedAt: Timestamp.now(),
      processingCompletedAt: Timestamp.now()
    });
  }
}

export async function setPaperCancelled(tenantId: string, paperId: string): Promise<void> {
  const db = getAdminFirestoreService();
  await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
    status: 'cancelled' as PaperStatus,
    statusUpdatedAt: Timestamp.now(),
    processingCompletedAt: Timestamp.now()
  });
}

export async function incrementPaperCost(
  tenantId: string,
  paperId: string,
  costField: 'ocr' | 'enrichment' | 'embedding',
  amount: number
): Promise<void> {
  const db = getAdminFirestoreService();
  await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
    [`costUsd.${costField}`]: FieldValue.increment(amount),
    'costUsd.total': FieldValue.increment(amount)
  });
}

/** Check abort signal — throw CancelledError if aborted */
export function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new CancelledError();
  }
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}
