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
    { title: 'Overview', titleKey: 'nav.overview', link: '/dashboard/overview' }
  ],
  '/dashboard/employee': [
    { title: 'Dashboard', titleKey: 'nav.dashboard', link: '/dashboard' },
    { title: 'Employee', titleKey: 'nav.employee', link: '/dashboard/employee' }
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
    { title: 'Notifications', titleKey: 'nav.notifications', link: '/dashboard/notifications' }
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

export function useBreadcrumbs(): BreadcrumbItem[] {
  // `usePathname` from `@/i18n/navigation` returns path WITHOUT locale prefix.
  const pathname = usePathname();

  return useMemo(() => {
    if (routeMapping[pathname]) {
      return routeMapping[pathname];
    }
    // Fallback: derive from URL segments
    const segments = pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      return {
        title: segment.charAt(0).toUpperCase() + segment.slice(1),
        titleKey: segmentToKey(segment),
        link: path
      };
    });
  }, [pathname]);
}
