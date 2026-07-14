'use client';
import { useMemo } from 'react';
import { useFeatureAccess } from '@/hooks/use-feature-access';
import { useRole } from '@/lib/auth/use-claims';
import type { NavGroup, NavItem } from '@/types';

/**
 * R172-1: filter nav items by access.role custom claim.
 * R487: additionally hide items whose featureKey the tenant admin disabled.
 * R497: wait for feature-access to LOAD before gating. While loading, the
 * resolved set is empty; gating then would flash every tab. Non-admins get an
 * empty nav until loaded (skeleton-friendly) rather than briefly-full-then-hide;
 * admins never gate so they render immediately.
 *
 * NavItem.access.role accepts a single role string. If present, item is shown
 * only when user role matches OR user is superadmin (full access).
 */
function roleAllows(item: NavItem, role: string | null | undefined): boolean {
  const requiredRole = item.access?.role;
  if (!requiredRole) return true;
  if (role === 'superadmin') return true;
  return role === requiredRole;
}

function useGatedKeys(): { gated: Set<string>; ready: boolean } {
  const role = useRole();
  const { disabled, loaded } = useFeatureAccess();
  const isAdmin = role === 'admin' || role === 'superadmin';
  return useMemo(
    () => ({
      // Admins never gate → always ready. Others must wait for the fetch.
      gated: isAdmin ? new Set<string>() : disabled,
      ready: isAdmin || loaded
    }),
    [isAdmin, disabled, loaded]
  );
}

function filterItem(item: NavItem, gated: Set<string>, role: string | null | undefined): boolean {
  return roleAllows(item, role) && (!item.featureKey || !gated.has(item.featureKey));
}

export function useFilteredNavItems(items: NavItem[]): NavItem[] {
  const role = useRole();
  const { gated, ready } = useGatedKeys();
  return useMemo(() => {
    if (!ready) return [];
    return items
      .filter((item) => filterItem(item, gated, role))
      .map((item) =>
        item.items && item.items.length > 0
          ? { ...item, items: item.items.filter((c) => !c.featureKey || !gated.has(c.featureKey)) }
          : item
      );
  }, [items, gated, ready, role]);
}

export function useFilteredNavGroups(groups: NavGroup[]): NavGroup[] {
  const role = useRole();
  const { gated, ready } = useGatedKeys();
  return useMemo(() => {
    if (!ready) return [];
    return groups
      .map((group) => ({
        ...group,
        items: group.items
          .filter((item) => filterItem(item, gated, role))
          .map((item) =>
            item.items && item.items.length > 0
              ? {
                  ...item,
                  items: item.items.filter((c) => !c.featureKey || !gated.has(c.featureKey))
                }
              : item
          )
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, gated, ready, role]);
}
