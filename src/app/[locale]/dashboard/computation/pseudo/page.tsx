/**
 * Pseudopotential library page — the tenant's UPF store with author-suggested
 * minimum cutoffs (parsed from each file's PP_HEADER) and upload.
 *
 * Path: /[locale]/dashboard/computation/pseudo
 *
 * @phase R353-pseudo-library
 */
import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { ComputationTabs } from '@/features/computation/components/computation-tabs';
import { PseudoLibraryView } from '@/features/computation/components/pseudo-library-view';
import { getCurrentTenantId } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function PseudoLibraryPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) notFound();

  return (
    <PageContainer>
      <ComputationTabs />
      <PseudoLibraryView />
    </PageContainer>
  );
}
