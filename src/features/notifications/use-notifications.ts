'use client';

/**
 * Live per-user notifications from Firestore — a drop-in replacement for the old
 * mock Zustand store (same shape: notifications, markAsRead, markAllAsRead,
 * removeNotification, unreadCount). Archived items are hidden.
 *
 * @phase R290 — real notifications
 */
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import type { Notification } from '@/features/notifications/notification';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase/client';
import {
  deleteNotificationDoc,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsPath
} from '@/lib/firestore/queries/notifications';

export function useNotifications(): {
  notifications: Notification[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  unreadCount: () => number;
  loading: boolean;
} {
  const tenantId = useTenantId();
  const uid = getFirebaseAuth().currentUser?.uid ?? null;
  const [all, setAll] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !uid) {
      setAll([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(getFirebaseFirestore(), notificationsPath(tenantId, uid)),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAll(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Notification));
        setLoading(false);
      },
      (err) => {
        console.error('useNotifications listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, uid]);

  const notifications = useMemo(() => all.filter((n) => n.status !== 'archived'), [all]);

  return {
    notifications,
    markAsRead: (id) => {
      if (tenantId && uid) void markNotificationRead(tenantId, uid, id);
    },
    markAllAsRead: () => {
      if (tenantId && uid) void markAllNotificationsRead(tenantId, uid, notifications);
    },
    removeNotification: (id) => {
      if (tenantId && uid) void deleteNotificationDoc(tenantId, uid, id);
    },
    unreadCount: () => notifications.filter((n) => n.status === 'unread').length,
    loading
  };
}
