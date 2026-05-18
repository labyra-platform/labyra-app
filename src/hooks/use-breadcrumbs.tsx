'use client';
import { useMemo } from 'react';
import { usePathname } from '@/i18n/navigation';

export type BreadcrumbItem = {
  title: string;
  titleKey?: string;
  link: string;
};

/**
 * Static route → breadcrumb chain mapping.
 * Use `titleKey` (next-intl key, full path) when the segment has a translation.
 * `title` remains as fallback for components that haven't wired t().
 */
const routeMapping: Record<string, BreadcrumbItem[]> = {
  '/dashboard': [{ title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' }],
  '/dashboard/overview': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    {
      title: 'Overview',
      titleKey: 'nav.overview',
      link: '/dashboard/overview'
    }
  ],
  '/dashboard/employee': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    {
      title: 'Employee',
      titleKey: 'nav.employee',
      link: '/dashboard/employee'
    }
  ],
  '/dashboard/product': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    { title: 'Product', titleKey: 'nav.product', link: '/dashboard/product' }
  ],
  '/dashboard/users': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    { title: 'Users', titleKey: 'nav.users', link: '/dashboard/users' }
  ],
  '/dashboard/notifications': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    {
      title: 'Notifications',
      titleKey: 'nav.notifications',
      link: '/dashboard/notifications'
    }
  ],
  '/dashboard/papers': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    { title: 'Papers', titleKey: 'nav.papers', link: '/dashboard/papers' }
  ],
  '/dashboard/papers/upload': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    { title: 'Papers', titleKey: 'nav.papers', link: '/dashboard/papers' },
    {
      title: 'Upload',
      titleKey: 'nav.upload',
      link: '/dashboard/papers/upload'
    }
  ],
  '/dashboard/superadmin/costs': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    {
      title: 'Superadmin',
      titleKey: 'nav.superadmin',
      link: '/dashboard/superadmin'
    },
    {
      title: 'Cost Overview',
      titleKey: 'nav.superadminCosts',
      link: '/dashboard/superadmin/costs'
    }
  ],
  '/dashboard/superadmin/evals': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    {
      title: 'Superadmin',
      titleKey: 'nav.superadmin',
      link: '/dashboard/superadmin'
    },
    {
      title: 'Quality Evals',
      titleKey: 'nav.superadminEvals',
      link: '/dashboard/superadmin/evals'
    }
  ],
  '/dashboard/superadmin/drift': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    {
      title: 'Superadmin',
      titleKey: 'nav.superadmin',
      link: '/dashboard/superadmin'
    },
    {
      title: 'Cost Drift',
      titleKey: 'nav.superadminDrift',
      link: '/dashboard/superadmin/drift'
    }
  ]
  // Add more mappings as new routes land
};

/**
 * Heuristic: kebab-case segment → nav.<camelCase> key.
 * e.g. 'data-assets' → 'nav.dataAssets'.
 * Returns undefined if no matching key — component falls back to title.
 */
function segmentToKey(segment: string): string {
  const camel = segment.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return `nav.${camel}`;
}

/**
 * Detect dynamic segment (ID/hash) vs static slug.
 * Dynamic if: long hex (>= 16 chars), UUID-like, or numeric-only.
 * Static routes have known names, no need to i18n-translate IDs.
 */
function isDynamicSegment(segment: string): boolean {
  // Hex hash (SHA-256 = 64 chars, MD5 = 32, etc.)
  if (/^[0-9a-f]{16,}$/i.test(segment)) return true;
  // UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
  // Numeric ID
  if (/^\d{6,}$/.test(segment)) return true;
  return false;
}

/** Truncate dynamic ID for display: keep first 8 chars + ellipsis */
function truncateId(segment: string): string {
  if (segment.length <= 12) return segment;
  return `${segment.slice(0, 8)}…`;
}

export function useBreadcrumbs(): BreadcrumbItem[] {
  // `usePathname` from `@/i18n/navigation` returns path WITHOUT locale prefix.
  const pathname = usePathname();

  return useMemo(() => {
    if (routeMapping[pathname]) {
      return routeMapping[pathname];
    }

    // Fallback: derive from URL segments
    const segments = pathname.split('/').filter(Boolean);

    // Special handling for known prefixes with dynamic detail pages
    // e.g. /dashboard/papers/{paperId}
    if (segments[0] === 'dashboard' && segments[1] === 'papers' && segments.length === 3) {
      const paperId = segments[2];
      return [
        { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
        { title: 'Papers', titleKey: 'nav.papers', link: '/dashboard/papers' },
        { title: truncateId(paperId), link: pathname }
      ];
    }

    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      if (isDynamicSegment(segment)) {
        // No titleKey — use truncated raw value
        return {
          title: truncateId(segment),
          link: path
        };
      }
      return {
        title: segment.charAt(0).toUpperCase() + segment.slice(1),
        titleKey: segmentToKey(segment),
        link: path
      };
    });
  }, [pathname]);
}
