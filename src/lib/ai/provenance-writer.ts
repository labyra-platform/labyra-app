/**
 * Server-only helper to write AI provenance records.
 * Writes go to /tenants/{tenantId}/aiProvenance/{messageId} via Admin SDK.
 * @phase R160-ai-2a
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { AiProvenance } from '@/types/ai';

export async function writeProvenance(record: AiProvenance): Promise<void> {
  const db = getAdminFirestoreService();
  const docRef = db
    .collection('tenants')
    .doc(record.tenantId)
    .collection('aiProvenance')
    .doc(record.messageId);

  await docRef.set({
    ...record,
    timestamp: Timestamp.fromMillis(record.timestamp)
  });
}
