'use client';

/**
 * BreadcrumbsConditional — hides the global header breadcrumb on routes that
 * already provide their own primary navigation (R233).
 *
 * Today the only such route family is /papers — the tab strip (R227+R230)
 * plus the sidebar and the page <h1> already place the user precisely; adding
 * "Dashboard / Papers / 6c1084d0…" on top just duplicates the locator and
 * adds visual noise (especially on detail/view, where the route id is opaque).
 *
 * Keeping this as a wrapper instead of editing Breadcrumbs itself preserves
 * the breadcrumbs component as a pure renderer and gives one obvious place to
 * extend the hide list when more route families gain their own nav.
 */
import { usePathname } from 'next/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';

/** Paths where the breadcrumb is suppressed. Locale prefix is allowed. */
const HIDDEN_PATTERNS: RegExp[] = [/\/dashboard\/papers(?:\/|$)/];

export function BreadcrumbsConditional() {
  const pathname = usePathname() ?? '';
  if (HIDDEN_PATTERNS.some((re) => re.test(pathname))) return null;
  return <Breadcrumbs />;
}
