'use client';

/**
 * R507: the caller's group roster.
 *
 * Shared by the members card and the equipment board — the board needs the
 * uid set to tell "someone in my group" from "another group", and both would
 * otherwise fetch the same endpoint. Scope is decided server-side; passing a
 * groupId only does anything for an admin.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface GroupMember {
  uid: string;
  displayName?: string;
  email: string;
  role: string;
  isGroupLead?: boolean;
}
export interface GroupRef {
  id: string;
  name: string;
}
interface MembersResponse {
  group: GroupRef | null;
  items: GroupMember[];
  groups: GroupRef[];
  canSwitchGroup: boolean;
}

export function useGroupRoster(groupId?: string | null): {
  group: GroupRef | null;
  members: GroupMember[];
  groups: GroupRef[];
  canSwitchGroup: boolean;
  /** uid → display name, for rendering ownership without a second fetch. */
  nameByUid: Map<string, string>;
  uids: Set<string>;
  isLoading: boolean;
} {
  const [data, setData] = useState<MembersResponse | null>(null);
  const [isLoading, setLoading] = useState(true);

  const load = useCallback(async (gid: string | null | undefined) => {
    setLoading(true);
    try {
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      if (!token) return;
      const qs = gid ? `?groupId=${encodeURIComponent(gid)}` : '';
      const res = await fetch(`/api/groups/my/members${qs}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      setData((await res.json()) as MembersResponse);
    } catch {
      // Leave the previous roster in place; callers render their own empty state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(groupId);
  }, [load, groupId]);

  const members = useMemo(() => data?.items ?? [], [data]);

  return useMemo(
    () => ({
      group: data?.group ?? null,
      members,
      groups: data?.groups ?? [],
      canSwitchGroup: Boolean(data?.canSwitchGroup),
      nameByUid: new Map(members.map((m) => [m.uid, m.displayName || m.email])),
      uids: new Set(members.map((m) => m.uid)),
      isLoading
    }),
    [data, members, isLoading]
  );
}
