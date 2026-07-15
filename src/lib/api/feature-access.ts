import 'server-only';

/**
 * Feature access — server-side resolution and enforcement (R508).
 *
 * Until now this gate lived entirely in the browser: the sidebar hid entries
 * and a client guard redirected. Neither is a boundary. The page had already
 * rendered by the time the guard ran, and any caller could skip the UI
 * altogether — `curl /api/chemicals` with a blocked member's token returned
 * the full list. Since ADR-042 prices tiers by feature, a decorative gate is
 * a billing bypass, not just a cosmetic slip.
 *
 * This module is the single place that answers "may this caller use feature
 * X", for both the settings endpoint and the routes being gated.
 */
import { NextResponse } from 'next/server';
import { getAdminFirestoreService } from '@/lib/firebase/admin';

export interface FeatureAccessDoc {
  disabled: string[];
  groups: Record<string, string[]>;
}

function featureAccessRef(tenantId: string) {
  return getAdminFirestoreService().doc(`tenants/${tenantId}/featureAccess/main`);
}

/** Raw document — for the admin settings screen, which edits every scope. */
export async function readFeatureAccess(tenantId: string): Promise<FeatureAccessDoc> {
  const snap = await featureAccessRef(tenantId).get();
  const data = snap.exists ? snap.data() : undefined;
  return {
    disabled: (data?.disabled as string[] | undefined) ?? [],
    groups: (data?.groups as Record<string, string[]> | undefined) ?? {}
  };
}

/**
 * The set of features this caller may not use.
 *
 * A group override replaces the tenant default outright (R491) rather than
 * merging with it — a group's configuration is meant to be readable on its
 * own, not as a diff against something else. Admins are never gated: they are
 * the ones who set the gate, and locking them out of their own settings would
 * be unrecoverable.
 */
export async function resolveDisabledFeatures(
  tenantId: string,
  groupId: string | null | undefined,
  role: string | null | undefined
): Promise<Set<string>> {
  if (role === 'admin' || role === 'superadmin') return new Set();
  const { disabled, groups } = await readFeatureAccess(tenantId);
  const resolved = groupId && groups[groupId] ? groups[groupId] : disabled;
  return new Set(resolved);
}

interface AuthLike {
  tenantId: string;
  groupId?: string | null;
  role?: string | null;
}

/**
 * Returns a 404 response when the caller's tenant has this feature switched
 * off for them, or null when they may proceed.
 *
 * 404 rather than 403: a disabled feature should look like it doesn't exist,
 * exactly as it does in their sidebar. 403 would confirm the feature is there
 * and merely withheld — an invitation to keep probing, and a hint about what
 * a higher tier contains.
 */
export async function featureBlockedResponse(
  auth: AuthLike,
  featureKey: string
): Promise<NextResponse | null> {
  const disabled = await resolveDisabledFeatures(auth.tenantId, auth.groupId, auth.role);
  if (!disabled.has(featureKey)) return null;
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}
