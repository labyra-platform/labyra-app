import { redirect } from 'next/navigation';

/**
 * Legacy path — notifications moved under Settings (R485). Keeps old
 * bookmarks/deep links working.
 */
export default async function LegacyNotificationsRedirect() {
  redirect('/dashboard/settings/notifications');
}
