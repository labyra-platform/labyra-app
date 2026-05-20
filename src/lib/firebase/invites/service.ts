/**
 * Invite service — server-side CRUD + claim grant via Admin SDK.
 *
 * Path: tenants/{tenantId}/invites/{inviteId}
 *
 * Security model (ADR-031):
 *  - Only admin/superadmin create invites (enforced at route).
 *  - Anti-escalation: admin cannot invite role 'admin' (only superadmin can).
 *  - acceptInvite verifies token email === invite email (case-insensitive).
 *  - Claims granted ONLY here, via Admin SDK. Client never self-assigns.
 *
 * @phase ONBOARD-1
 */
import 'server-only';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import type { CreateInviteInput, Invite, InviteRole } from '@/lib/schemas/invite-schema';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function invitesCol(tenantId: string) {
  return getAdminFirestoreService().collection(`tenants/${tenantId}/invites`);
}

export async function createInvite(
  tenantId: string,
  input: CreateInviteInput,
  invitedByUid: string
): Promise<Invite> {
  const now = Date.now();
  const ref = invitesCol(tenantId).doc();
  const invite: Invite = {
    id: ref.id,
    tenantId,
    email: input.email.toLowerCase(),
    role: input.role,
    invitedBy: invitedByUid,
    status: 'pending',
    createdAt: now,
    expiresAt: now + INVITE_TTL_MS
  };
  await ref.set(invite);
  return invite;
}

export async function listInvites(tenantId: string): Promise<Invite[]> {
  const snap = await invitesCol(tenantId).orderBy('createdAt', 'desc').limit(200).get();
  return snap.docs.map((d) => ({ ...(d.data() as Invite), id: d.id }));
}

export async function revokeInvite(tenantId: string, inviteId: string): Promise<void> {
  const ref = invitesCol(tenantId).doc(inviteId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('invite_not_found');
  const invite = snap.data() as Invite;
  if (invite.status !== 'pending') throw new Error('invite_not_pending');
  await ref.update({ status: 'revoked' });
}

/**
 * List pending invites matching an email, across ALL tenants.
 * Uses collectionGroup — requires composite index on (email, status).
 */
export async function findPendingInvitesByEmail(email: string): Promise<Invite[]> {
  const db = getAdminFirestoreService();
  const snap = await db
    .collectionGroup('invites')
    .where('email', '==', email.toLowerCase())
    .where('status', '==', 'pending')
    .limit(50)
    .get();
  const now = Date.now();
  return snap.docs
    .map((d) => ({ ...(d.data() as Invite), id: d.id }))
    .filter((inv) => inv.expiresAt > now);
}

/**
 * Accept an invite: verify ownership by email, grant claims, mark accepted.
 *
 * @throws if invite missing / not pending / expired / email mismatch
 */
export async function acceptInvite(
  inviteId: string,
  tenantId: string,
  uid: string,
  tokenEmail: string
): Promise<{ tenantId: string; role: InviteRole }> {
  const db = getAdminFirestoreService();
  const ref = db.doc(`tenants/${tenantId}/invites/${inviteId}`);

  // Transaction: re-check status inside to prevent double-accept races.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('invite_not_found');
    const invite = snap.data() as Invite;

    if (invite.status !== 'pending') throw new Error('invite_not_pending');
    if (invite.expiresAt <= Date.now()) throw new Error('invite_expired');
    if (invite.email.toLowerCase() !== tokenEmail.toLowerCase()) {
      throw new Error('email_mismatch');
    }

    tx.update(ref, {
      status: 'accepted',
      acceptedAt: Date.now(),
      acceptedBy: uid
    });
    return { tenantId: invite.tenantId, role: invite.role };
  });

  // Grant custom claims (outside tx — Auth API isn't transactional with Firestore).
  const auth = getAdminAuthService();
  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims ?? {};
  await auth.setCustomUserClaims(uid, {
    ...currentClaims,
    tenantId: result.tenantId,
    role: result.role
  });

  return result;
}
