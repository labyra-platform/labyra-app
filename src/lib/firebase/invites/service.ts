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
import { listTenantMembers } from '@/lib/firebase/members/service';
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
    expiresAt: now + INVITE_TTL_MS,
    ...(input.groupId ? { groupId: input.groupId } : {})
  };
  // Strip undefined before write (Firestore rejects undefined).
  await ref.set(JSON.parse(JSON.stringify(invite)));
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
    return { tenantId: invite.tenantId, role: invite.role, groupId: invite.groupId };
  });

  // Grant custom claims (outside tx — Auth API isn't transactional with Firestore).
  const auth = getAdminAuthService();
  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims ?? {};
  await auth.setCustomUserClaims(uid, {
    ...currentClaims,
    tenantId: result.tenantId,
    role: result.role,
    // ADR-034 TEAM-2: assign group on accept if the invite specified one.
    // isGroupLead stays false — leadership is appointed separately by an admin.
    ...(result.groupId ? { groupId: result.groupId } : {})
  });

  // R575: tell the admins a member has joined. Fired here, after the claims are
  // actually set — not on invite-send, which is a promise, but on accept, which
  // is the fact. Best-effort: a notification failure must not fail the join the
  // user just completed, so it is caught and swallowed with the claims already
  // committed above.
  void notifyAdminsOfNewMember(result.tenantId, uid, tokenEmail).catch(() => {});

  return result;
}

/**
 * Notify every admin/superadmin of the tenant that a new member has joined.
 *
 * Server-side, so it writes through the Admin SDK (getAdminFirestoreService),
 * which bypasses the userNotifications rule that otherwise restricts writes to
 * `uid == request.auth.uid` — this is the one legitimate cross-user write, and
 * it only runs inside an already-authorised accept.
 *
 * The new member is not notified — they just clicked accept, they know. The
 * people who need to hear it are the admins who invited them.
 */
async function notifyAdminsOfNewMember(
  tenantId: string,
  newUid: string,
  newEmail: string
): Promise<void> {
  const members = await listTenantMembers(tenantId);
  const admins = members.filter(
    (m) => (m.role === 'admin' || m.role === 'superadmin') && m.uid !== newUid
  );
  if (admins.length === 0) return;

  const db = getAdminFirestoreService();
  const createdAt = new Date().toISOString();
  await Promise.all(
    admins.map((admin) =>
      db.collection(`tenants/${tenantId}/userNotifications/${admin.uid}/items`).add({
        title: 'Thành viên mới',
        body: `${newEmail} đã tham gia nhóm.`,
        status: 'unread',
        type: 'member_joined',
        href: '/dashboard/members',
        createdAt
      })
    )
  );
}
