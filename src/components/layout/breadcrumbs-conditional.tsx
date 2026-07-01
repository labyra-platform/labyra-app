'use client';

/**
 * BreadcrumbsConditional — hides the global header breadcrumb on routes that
 * already provide their own primary navigation (R233).
 *
 * These route families place the user precisely via their own toolbar / tab
 * strip plus the sidebar, so "Dashboard / Papers / 6c1084d0…" on top just
 * duplicates the locator and adds visual noise (especially on detail/view,
 * where the route id is opaque):
 *   - /papers        — tab strip (R227+R230)
 *   - /computation   — job toolbar (Structures / Compose / Compare / New)
 *   - /structures    — structure-library toolbar
 *
 * Keeping this as a wrapper instead of editing Breadcrumbs itself preserves
 * the breadcrumbs component as a pure renderer and gives one obvious place to
 * extend the hide list when more route families gain their own nav.
 */
import { usePathname } from 'next/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';

/** Paths where the breadcrumb is suppressed. Locale prefix is allowed. */
const HIDDEN_PATTERNS: RegExp[] = [
  /\/dashboard\/papers(?:\/|$)/,
  /\/dashboard\/computation(?:\/|$)/,
  /\/dashboard\/structures(?:\/|$)/
];

export function BreadcrumbsConditional() {
  const pathname = usePathname() ?? '';
  if (HIDDEN_PATTERNS.some((re) => re.test(pathname))) return null;
  return <Breadcrumbs />;
}
