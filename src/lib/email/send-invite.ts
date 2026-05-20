/**
 * sendInviteEmail — high-level helper. Best-effort, never throws.
 *
 * @phase ONBOARD-EMAIL
 */
import 'server-only';
import { getEmailProvider } from './client';
import type { SendResult } from './types';
import { buildInviteEmail } from './templates/invite';

interface SendInviteInput {
  to: string;
  tenantName: string;
  role: 'admin' | 'member' | 'viewer';
}

export async function sendInviteEmail(input: SendInviteInput): Promise<SendResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://labyra-app.vercel.app';
  const msg = buildInviteEmail({ ...input, appUrl });
  return getEmailProvider().send(msg);
}
