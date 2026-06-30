/**
 * Computation compare page — overlay band gaps across runs (e.g. a Hubbard U
 * sweep). Server Component: loads the tenant's workflows, projects the
 * calibration scalars, hands them to the client compare view.
 *
 * Path: /[locale]/dashboard/computation/compare (static segment wins over the
 * sibling [workflowId] dynamic route).
 *
 * @phase R307-compare-runs
 */
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { DftCompareView } from '@/features/computation/components/dft-compare-view';
import { toCompareRow } from '@/features/computation/compare-rows';
import { getCurrentTenantId } from '@/lib/auth/server';
import { listDftWorkflows } from '@/lib/firebase/dft/service';

export const dynamic = 'force-dynamic';

export default async function ComputationComparePage() {
  const t = await getTranslations('computation');
  const tenantId = await getCurrentTenantId();
  if (!tenantId) notFound();
  const workflows = await listDftWorkflows(tenantId);
  const rows = workflows.map(toCompareRow);

  return (
    <PageContainer pageTitle={t('compareTitle')} pageDescription={t('compareDescription')}>
      <DftCompareView rows={rows} />
    </PageContainer>
  );
}
