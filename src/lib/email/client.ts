/**
 * Email client — Resend-backed EmailProvider with a feature flag.
 *
 * Env:
 *   EMAIL_ENABLED   'true' to actually send; anything else → no-op.
 *   RESEND_API_KEY  required when enabled.
 *   EMAIL_FROM      e.g. 'Labyra <noreply@labyra.io>'. Falls back to resend.dev sandbox.
 *
 * Until a custom domain is verified in Resend, keep EMAIL_ENABLED unset/false.
 * Invite creation works regardless; emails simply aren't dispatched.
 *
 * @phase ONBOARD-EMAIL
 */
import 'server-only';
import { Resend } from 'resend';
import type { EmailMessage, EmailProvider, SendResult } from './types';

const FALLBACK_FROM = 'Labyra <onboarding@resend.dev>';

function isEnabled(): boolean {
  return process.env.EMAIL_ENABLED === 'true';
}

let cachedResend: Resend | null = null;
function getResend(): Resend | null {
  if (cachedResend) return cachedResend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cachedResend = new Resend(key);
  return cachedResend;
}

class ResendProvider implements EmailProvider {
  async send(msg: EmailMessage): Promise<SendResult> {
    // Feature flag off → graceful no-op. Caller treats as success.
    if (!isEnabled()) {
      // eslint-disable-next-line no-console -- intentional ops visibility
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'email_skipped_disabled',
          to: msg.to,
          subject: msg.subject
        })
      );
      return { ok: true, skipped: true };
    }

    const resend = getResend();
    if (!resend) {
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({ level: 'warn', event: 'email_no_api_key', to: msg.to }));
      return { ok: false, error: 'missing_api_key' };
    }

    try {
      const from = process.env.EMAIL_FROM || FALLBACK_FROM;
      const { data, error } = await resend.emails.send({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text
      });
      if (error) {
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({ level: 'error', event: 'email_send_failed', error: error.message })
        );
        return { ok: false, error: error.message };
      }
      return { ok: true, id: data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ level: 'error', event: 'email_send_threw', error: message }));
      return { ok: false, error: message };
    }
  }
}

let provider: EmailProvider | null = null;
export function getEmailProvider(): EmailProvider {
  if (!provider) provider = new ResendProvider();
  return provider;
}
