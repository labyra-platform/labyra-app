/**
 * Provider-agnostic email interfaces.
 *
 * Callers depend on these, never on Resend directly — swapping providers
 * (SES, Postmark) means a new EmailProvider impl, zero caller changes.
 *
 * @phase ONBOARD-EMAIL
 */
import 'server-only';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  /** true if sent (or no-op when disabled — treated as success, non-blocking). */
  ok: boolean;
  /** Provider message id when available. */
  id?: string;
  /** Reason when ok=false. Logged, never thrown to the caller. */
  error?: string;
  /** true when email was skipped because the feature flag is off. */
  skipped?: boolean;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<SendResult>;
}
