/**
 * Invite email template — pure function, transport-agnostic.
 *
 * @phase ONBOARD-EMAIL
 */
import 'server-only';
import type { EmailMessage } from '../types';

interface InviteTemplateInput {
  to: string;
  tenantName: string;
  role: 'admin' | 'member' | 'viewer';
  appUrl: string; // e.g. https://app.labyra.io
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildInviteEmail(input: InviteTemplateInput): EmailMessage {
  const tenant = escapeHtml(input.tenantName);
  const role = escapeHtml(input.role);
  const signInUrl = `${input.appUrl}/sign-up`;

  const subject = `You're invited to join ${input.tenantName} on Labyra`;

  const text = [
    `You've been invited to join ${input.tenantName} on Labyra as a ${input.role}.`,
    '',
    `To accept, sign up with this email address (${input.to}) at:`,
    signInUrl,
    '',
    `After signing up you'll be able to accept the invitation and access the lab.`,
    `This invitation expires in 7 days.`
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:40px 24px;color:#e5e5e5;">
      <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;">You're invited to Labyra</h1>
      <p style="font-size:14px;line-height:1.6;color:#a3a3a3;margin:0 0 24px;">
        You've been invited to join <strong style="color:#e5e5e5;">${tenant}</strong>
        as a <strong style="color:#e5e5e5;">${role}</strong>.
      </p>
      <a href="${signInUrl}"
         style="display:inline-block;background:#fafafa;color:#0a0a0a;text-decoration:none;
                font-size:14px;font-weight:500;padding:10px 20px;border-radius:6px;">
        Sign up to accept
      </a>
      <p style="font-size:12px;line-height:1.6;color:#737373;margin:24px 0 0;">
        Sign up with this exact email address (${escapeHtml(input.to)}) to join.
        This invitation expires in 7 days.
      </p>
    </div>
  </body>
</html>`;

  return { to: input.to, subject, html, text };
}
