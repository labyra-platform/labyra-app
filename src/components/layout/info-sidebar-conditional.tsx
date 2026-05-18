'use client';

/**
 * Client wrapper that hides InfoSidebar on /view pages (R179-7a).
 *
 * Why: dashboard layout is async server component. We can't use usePathname()
 * there. This thin client component reads the pathname and only renders the
 * InfoSidebar when NOT on a PDF view page (which needs full width).
 *
 * @phase R179-7a
 * @r179-7-applied
 */
import { usePathname } from 'next/navigation';
import { InfoSidebar } from '@/components/layout/info-sidebar';

export function InfoSidebarConditional() {
  const pathname = usePathname() ?? '';
  // Hide on PDF reader page: /<locale>/dashboard/papers/<id>/view
  // Match by suffix to be locale-agnostic.
  if (pathname.endsWith('/view') || pathname.includes('/view/')) return null;
  return <InfoSidebar side='right' />;
}
