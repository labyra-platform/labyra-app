/**
 * A persisted, per-user notification (replaces the old mock Zustand store).
 * Stored at tenants/{tid}/userNotifications/{uid}/items/{notifId}. createdAt is
 * an ISO string so it both sorts chronologically and feeds NotificationCard.
 *
 * @phase R290 — real notifications
 */
import type { NotificationAction, NotificationStatus } from '@/components/ui/notification-card';

export type Notification = {
  id: string;
  title: string;
  body: string;
  status: NotificationStatus;
  /** ISO timestamp. */
  createdAt: string;
  /** Optional in-app link opened when the notification is clicked. */
  href?: string;
  /** Category, e.g. 'dft' | 'paper' | 'system'. */
  type?: string;
  actions?: NotificationAction[];
};
