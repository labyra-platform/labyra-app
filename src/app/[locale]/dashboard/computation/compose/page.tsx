/**
 * Computation composer page — build a fresh pipeline (archetype + tunable node
 * params) on a structure inherited from an existing run, with a live workflow-
 * JSON preview. Server Component: loads the tenant's runs for the source picker.
 *
 * Path: /[locale]/dashboard/computation/compose (static segment wins over the
 * sibling [workflowId] dynamic route).
 *
 * @phase R315-composer
 */
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { DftComposeView } from '@/features/computation/components/dft-compose-view';
import { getCurrentTenantId } from '@/lib/auth/server';
import { listDftWorkflows } from '@/lib/firebase/dft/service';

export const dynamic = 'force-dynamic';

export default async function ComputationComposePage() {
  const t = await getTranslations('computation');
  const tenantId = await getCurrentTenantId();
  if (!tenantId) notFound();
  const workflows = await listDftWorkflows(tenantId);
  const runs = workflows.map((w) => ({ id: w.id, name: w.global?.prefix ?? w.id }));

  return (
    <PageContainer pageTitle={t('composeTitle')} pageDescription={t('composeDescription')}>
      <DftComposeView runs={runs} />
    </PageContainer>
  );
}
