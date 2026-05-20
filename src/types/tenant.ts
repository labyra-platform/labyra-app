/**
 * Tenant root document — `/tenants/{tenantId}`.
 *
 * Formalizes the shape currently written ad-hoc by seed-dev-tenant.mjs.
 * `plan` will gate features once billing ships (ADR-billing, future).
 *
 * @phase TD-ONBOARD (formalized from implicit shape)
 */
export type TenantPlan = 'dev' | 'free' | 'trial' | 'pro' | 'enterprise';

export interface Tenant {
  /** Document ID (e.g. 'tenant-dev-001'). Not stored in the doc body. */
  id: string;
  name: string;
  plan: TenantPlan;
  createdAt: number;
  /** Email or uid of the creator. */
  createdBy: string;
  /** Optional — set when billing ships. */
  trialEndsAt?: number;
  stripeCustomerId?: string;
}
