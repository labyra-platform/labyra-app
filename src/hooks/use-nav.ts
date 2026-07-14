'use client';
import { useFeatureAccess } from '@/hooks/use-feature-access';
import { useRole } from '@/lib/auth/use-claims';
import type { NavGroup, NavItem } from '@/types';

/**
 * R172-1: filter nav items by access.role custom claim.
 * R487: additionally hide items whose featureKey the tenant admin disabled.
 * Admin/superadmin always see everything (they manage the gate — no lockout).
 *
 * NavItem.access.role accepts a single role string. If present, item is
 * shown only when user role matches OR user is superadmin (full access).
 */
function roleAllows(item: NavItem, role: string | null | undefined): boolean {
  const requiredRole = item.access?.role;
  if (!requiredRole) return true;
  if (role === 'superadmin') return true;
  return role === requiredRole;
}

export function useFilteredNavItems(items: NavItem[]): NavItem[] {
  const role = useRole();
  const { disabled } = useFeatureAccess();
  const gated = role === 'admin' || role === 'superadmin' ? new Set<string>() : disabled;
  return items
    .filter((item) => roleAllows(item, role))
    .filter((item) => !item.featureKey || !gated.has(item.featureKey))
    .map((item) =>
      item.items && item.items.length > 0
        ? {
            ...item,
            items: item.items.filter((c) => !c.featureKey || !gated.has(c.featureKey))
          }
        : item
    );
}

export function useFilteredNavGroups(groups: NavGroup[]): NavGroup[] {
  const role = useRole();
  const { disabled } = useFeatureAccess();
  const gated = role === 'admin' || role === 'superadmin' ? new Set<string>() : disabled;
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => roleAllows(item, role))
        .filter((item) => !item.featureKey || !gated.has(item.featureKey))
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
}
