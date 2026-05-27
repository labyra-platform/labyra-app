'use client';

/**
 * Client wrapper that hides InfoSidebar on full-width reading pages.
 *
 * Why: dashboard layout is an async server component, so we can't use
 * usePathname() there. This thin client component reads the pathname and hides
 * the global right InfoSidebar on pages that own their full width:
 *   - PDF reader:        /<locale>/dashboard/papers/<id>/view   (R179-7a)
 *   - Split read view:   /<locale>/dashboard/papers/<id>        (R224d)
 * Both already have their own right panel; the global InfoSidebar would push
 * the layout past the viewport (horizontal overflow). The papers LIST
 * (/papers, no id) keeps the InfoSidebar.
 *
 * @phase R179-7a, R224d
 */
import { usePathname } from 'next/navigation';
import { InfoSidebar } from '@/components/layout/info-sidebar';

// Matches /dashboard/papers/<id> and /dashboard/papers/<id>/view, but NOT the
// bare list /dashboard/papers nor known sub-routes like /papers/upload. <id> is
// any segment that isn't a reserved word. Locale-agnostic.
const PAPER_DETAIL_RE = /\/dashboard\/papers\/(?!upload(?:\/|$))[^/]+(?:\/view)?\/?$/;

export function InfoSidebarConditional() {
  const pathname = usePathname() ?? '';
  if (PAPER_DETAIL_RE.test(pathname)) return null;
  return <InfoSidebar side='right' />;
}
