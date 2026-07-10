'use client';

/**
 * Client Firestore CRUD for per-user notifications, stored at
 * tenants/{tid}/userNotifications/{uid}/items. Ordered by the ISO createdAt
 * string (chronological, single-field → auto-indexed). Security by rules.
 *
 * @phase R290 — real notifications
 */
import { addDoc, collection, doc, updateDoc, writeBatch } from 'firebase/firestore';

import type { Notification } from '@/features/notifications/notification';
import { getFirebaseFirestore } from '@/lib/firebase/client';

export function notificationsPath(tenantId: string, uid: string): string {
  return `tenants/${tenantId}/userNotifications/${uid}/items`;
}

export interface NewNotification {
  title: string;
  body: string;
  href?: string;
  type?: string;
}

/** Create a notification for a user. Safe to call from any client event. */
export async function createNotification(
  tenantId: string,
  uid: string,
  n: NewNotification
): Promise<void> {
  const db = getFirebaseFirestore();
  const payload: Record<string, unknown> = {
    title: n.title,
    body: n.body,
    status: 'unread',
    createdAt: new Date().toISOString()
  };
  if (n.href) payload.href = n.href;
  if (n.type) payload.type = n.type;
  await addDoc(collection(db, notificationsPath(tenantId, uid)), payload);
}

export async function markNotificationRead(
  tenantId: string,
  uid: string,
  notifId: string
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, notificationsPath(tenantId, uid), notifId), { status: 'read' });
}

export async function markAllNotificationsRead(
  tenantId: string,
  uid: string,
  notifs: Notification[]
): Promise<void> {
  const db = getFirebaseFirestore();
  const batch = writeBatch(db);
  for (const n of notifs) {
    if (n.status !== 'read') {
      batch.update(doc(db, notificationsPath(tenantId, uid), n.id), { status: 'read' });
    }
  }
  await batch.commit();
}

export async function deleteNotificationDoc(
  tenantId: string,
  uid: string,
  notifId: string
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, notificationsPath(tenantId, uid), notifId), { status: 'archived' });
}
