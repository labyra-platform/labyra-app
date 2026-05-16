'use client';
import type { NavItem, NavGroup } from '@/types';
import { useRole } from '@/lib/auth/use-claims';

/**
 * R172-1: filter nav items by access.role custom claim.
 *
 * NavItem.access.role accepts a single role string. If present, item is
 * shown only when user role matches OR user is superadmin (full access).
 */
export function useFilteredNavItems(items: NavItem[]): NavItem[] {
  const role = useRole();
  return items.filter((item) => {
    const requiredRole = item.access?.role;
    if (!requiredRole) return true;
    if (role === 'superadmin') return true;
    return role === requiredRole;
  });
}

export function useFilteredNavGroups(groups: NavGroup[]): NavGroup[] {
  const role = useRole();
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const requiredRole = item.access?.role;
        if (!requiredRole) return true;
        if (role === 'superadmin') return true;
        return role === requiredRole;
      })
    }))
    .filter((group) => group.items.length > 0);
}
