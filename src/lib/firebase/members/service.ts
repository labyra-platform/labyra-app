/**
 * Member management — list tenant members and move them between research groups.
 *
 * Membership is stored in Firebase Auth custom claims (tenantId + role + groupId
 * + isGroupLead), NOT a Firestore collection, so we enumerate via Admin SDK
 * listUsers() and filter by the tenantId claim. ADR-034 TEAM-4: this is the
 * "member groupId reassignment" deferred from TEAM-3.
 *
 * @phase R285 (ADR-034 TEAM-4)
 */
import 'server-only';
import { getAdminAuthService, getUserById, setUserClaims } from '@/lib/firebase/admin';
import { getGroup } from '@/lib/firebase/groups/service';

export interface TenantMember {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  groupId: string;
  isGroupLead: boolean;
  disabled: boolean;
}

function toMember(
  uid: string,
  claims: Record<string, unknown>,
  rec: {
    email?: string;
    displayName?: string;
    disabled?: boolean;
  }
): TenantMember {
  return {
    uid,
    email: rec.email ?? '',
    displayName: rec.displayName ?? '',
    role: typeof claims.role === 'string' ? claims.role : '',
    groupId: typeof claims.groupId === 'string' ? claims.groupId : '',
    isGroupLead: claims.isGroupLead === true,
    disabled: rec.disabled === true
  };
}

/** All Auth users whose tenantId claim matches. Paginated (1000/page). */
export async function listTenantMembers(tenantId: string): Promise<TenantMember[]> {
  const auth = getAdminAuthService();
  const members: TenantMember[] = [];
  let pageToken: string | undefined;
  do {
    const res = await auth.listUsers(1000, pageToken);
    for (const u of res.users) {
      const claims = (u.customClaims ?? {}) as Record<string, unknown>;
      if (claims.tenantId !== tenantId) continue;
      members.push(toMember(u.uid, claims, u));
    }
    pageToken = res.pageToken;
  } while (pageToken);
  return members;
}

/**
 * Move a member into a group by rewriting their groupId claim. Demotes
 * isGroupLead (a moved member becomes a regular member of the target group;
 * reassign leadership separately if needed). The member must re-authenticate
 * for the new claim to take effect.
 */
export async function moveMemberToGroup(
  tenantId: string,
  uid: string,
  groupId: string
): Promise<TenantMember> {
  const user = await getUserById(uid);
  const claims = (user.customClaims ?? {}) as Record<string, unknown>;
  if (claims.tenantId !== tenantId) {
    throw new Error('member_not_in_tenant');
  }
  const group = await getGroup(tenantId, groupId);
  if (!group) {
    throw new Error('group_not_found');
  }
  const next = { ...claims, groupId, isGroupLead: false };
  await setUserClaims(uid, next);
  return toMember(uid, next, user);
}
