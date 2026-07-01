/**
 * MP Explorer page — Materials-Explorer-style search over the Materials Project
 * with a periodic-table element picker, results table, and one-click import into
 * the crystal structure library.
 *
 * Path: /[locale]/dashboard/computation/explore
 *
 * @phase R325-mp-explorer
 */
import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { ComputationTabs } from '@/features/computation/components/computation-tabs';
import { ExploreMpView } from '@/features/crystal-structures/mp-explorer/explore-mp-view';
import { getCurrentTenantId } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function ExploreMpPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) notFound();

  return (
    <PageContainer>
      <ComputationTabs />
      <ExploreMpView />
    </PageContainer>
  );
}
