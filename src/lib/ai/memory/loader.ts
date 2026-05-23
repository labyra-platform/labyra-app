/**
 * Memory loaders (ADR-035 M1) — server-side, Admin SDK.
 *
 * Reads:
 *  - L3 procedural preferences: users/{uid}/aiPreferences/settings
 *  - L4 tenant context:         tenants/{tid}/aiContext/main
 *
 * Both are best-effort: a missing doc returns null and the caller falls back
 * to the base prompt. Failures are swallowed (logged) so memory never breaks
 * the chat path.
 *
 * @phase R192-mem-m1a
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { AiPreferences, TenantAiContext } from '@/types/memory';

/** Canonical single-doc ids (one settings doc per user / one context per tenant). */
export const AI_PREFERENCES_DOC = 'settings';
export const TENANT_AI_CONTEXT_DOC = 'main';

export function aiPreferencesRef(uid: string) {
  return getAdminFirestoreService().doc(`users/${uid}/aiPreferences/${AI_PREFERENCES_DOC}`);
}

export function tenantAiContextRef(tenantId: string) {
  return getAdminFirestoreService().doc(`tenants/${tenantId}/aiContext/${TENANT_AI_CONTEXT_DOC}`);
}

/** L3 — load a user's AI preferences. null if unset or on error. */
export async function loadProceduralMemory(uid: string): Promise<AiPreferences | null> {
  try {
    const snap = await aiPreferencesRef(uid).get();
    if (!snap.exists) return null;
    return snap.data() as AiPreferences;
  } catch (err) {
    console.warn('loadProceduralMemory failed', { uid, err });
    return null;
  }
}

/** L4 — load a tenant's shared AI context. null if unset or on error. */
export async function loadTenantContext(tenantId: string): Promise<TenantAiContext | null> {
  try {
    const snap = await tenantAiContextRef(tenantId).get();
    if (!snap.exists) return null;
    return snap.data() as TenantAiContext;
  } catch (err) {
    console.warn('loadTenantContext failed', { tenantId, err });
    return null;
  }
}
