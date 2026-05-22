/**
 * Group service — Admin SDK CRUD + leader appointment.
 *
 * Path: tenants/{tenantId}/groups/{groupId}
 *
 * Per ADR-034 (TEAM-1): groups are people-groups. Leadership is granted via
 * custom claims (groupId + isGroupLead) on the leader's user — NOT a role.
 * Claims are set here via Admin SDK only; clients never self-assign.
 *
 * This phase does NOT scope any data by groupId yet (TEAM-3/4).
 *
 * @phase TEAM-1 (ADR-034)
 */
import 'server-only';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import type { Group } from '@/types/group';

function groupsCol(tenantId: string) {
  return getAdminFirestoreService().collection(`tenants/${tenantId}/groups`);
}

export async function createGroup(
  tenantId: string,
  name: string,
  createdBy: string
): Promise<Group> {
  const ref = groupsCol(tenantId).doc();
  const now = Date.now();
  const group: Group = {
    schemaVersion: 1,
    id: ref.id,
    tenantId,
    name,
    createdBy,
    createdAt: now,
    updatedAt: now
  };
  // Strip undefined (Firestore rejects undefined).
  await ref.set(JSON.parse(JSON.stringify(group)));
  return group;
}

export async function listGroups(tenantId: string): Promise<Group[]> {
  const snap = await groupsCol(tenantId).orderBy('createdAt', 'desc').limit(200).get();
  return snap.docs.map((d) => ({ ...(d.data() as Group), id: d.id }));
}

export async function getGroup(tenantId: string, id: string): Promise<Group | null> {
  const snap = await groupsCol(tenantId).doc(id).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as Group), id: snap.id };
}

export async function updateGroup(
  tenantId: string,
  id: string,
  patch: { name?: string; leaderId?: string | null }
): Promise<void> {
  const ref = groupsCol(tenantId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('group_not_found');

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (patch.name !== undefined) update.name = patch.name;

  // Leader appointment/transfer: update doc + sync custom claims.
  if (patch.leaderId !== undefined) {
    const current = snap.data() as Group;
    const newLeader = patch.leaderId; // string uid or null
    update.leaderId = newLeader ?? null;

    const auth = getAdminAuthService();

    // Demote previous leader (clear isGroupLead) if changing/clearing.
    if (current.leaderId && current.leaderId !== newLeader) {
      const prev = await auth.getUser(current.leaderId);
      await auth.setCustomUserClaims(current.leaderId, {
        ...prev.customClaims,
        isGroupLead: false
      });
    }

    // Promote new leader: set groupId + isGroupLead. (Does NOT change role.)
    if (newLeader) {
      const u = await auth.getUser(newLeader);
      const claims = u.customClaims ?? {};
      if (claims.tenantId !== tenantId) throw new Error('leader_not_in_tenant');
      await auth.setCustomUserClaims(newLeader, {
        ...claims,
        groupId: id,
        isGroupLead: true
      });
    }
  }

  await ref.update(update);
}

export async function deleteGroup(tenantId: string, id: string): Promise<void> {
  const ref = groupsCol(tenantId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('group_not_found');
  const group = snap.data() as Group;

  // Clear leader's lead claim before removing the group.
  if (group.leaderId) {
    const auth = getAdminAuthService();
    try {
      const u = await auth.getUser(group.leaderId);
      await auth.setCustomUserClaims(group.leaderId, {
        ...u.customClaims,
        isGroupLead: false
      });
    } catch {
      // leader user may have been deleted — non-fatal
    }
  }
  // NOTE: member groupId claims + data reassignment handled in TEAM-4.
  await ref.delete();
}
