/**
 * paperGroupAccess (R498) — the single ADR-034 read-scope check for a paper,
 * shared by every /api/papers/[id]/* route so the guard can't drift per route.
 *
 * A paper is visible to the caller when any holds:
 *   - caller is admin/superadmin (tenant-wide),
 *   - the paper is lab-shared (groupId === 'lab-shared'),
 *   - the paper's groupId matches the caller's groupId claim.
 *
 * Loads the paper doc once and returns it so callers don't re-read. Returns a
 * discriminated result rather than throwing, so each route maps it to its own
 * response shape (some use NextResponse, some Response.json).
 */
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getGroupIdFromToken, getRoleFromToken } from '@/lib/auth/token';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { Paper } from '@/types/papers';

export type PaperAccessResult =
  | { ok: true; paper: Paper }
  | { ok: false; status: 404 } // not found OR foreign group — indistinguishable on purpose
  | { ok: false; status: 500 };

export async function loadPaperForRead(
  decoded: DecodedIdToken,
  tenantId: string,
  paperId: string
): Promise<PaperAccessResult> {
  try {
    const snap = await getAdminFirestoreService()
      .doc(`tenants/${tenantId}/papers/${paperId}`)
      .get();
    if (!snap.exists) return { ok: false, status: 404 };

    const paper = snap.data() as Paper;
    if (paperReadAllowed(decoded, paper)) return { ok: true, paper };
    // Foreign group → 404 (never 403): don't confirm the paper exists.
    return { ok: false, status: 404 };
  } catch {
    return { ok: false, status: 500 };
  }
}

/** Pure predicate — use when the doc is already in hand. */
export function paperReadAllowed(decoded: DecodedIdToken, paper: Paper): boolean {
  const role = getRoleFromToken(decoded);
  if (role === 'admin' || role === 'superadmin') return true;
  const groupId = paper.groupId ?? 'lab-shared';
  if (groupId === 'lab-shared') return true;
  return groupId === getGroupIdFromToken(decoded);
}
