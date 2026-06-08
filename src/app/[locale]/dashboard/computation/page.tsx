/**
 * Computation page — lists DFT workflows and their extracted results.
 *
 * Path: /[locale]/dashboard/computation
 *
 * Server Component: reads tenants/{tenantId}/dftWorkflows via the server-only
 * service (tenant isolation enforced by the tenantId path segment). The Python
 * worker writes results; the app is read-only.
 *
 * @phase R238-dft-results-ui
 */
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { DftResultsCard } from '@/features/computation/components/dft-results-card';
import { getCurrentTenantId } from '@/lib/auth/server';
import { listDftWorkflows } from '@/lib/firebase/dft/service';

export const dynamic = 'force-dynamic';

export default async function ComputationPage() {
  const tNav = await getTranslations('nav');
  const t = await getTranslations('computation');

  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    notFound();
  }

  const workflows = await listDftWorkflows(tenantId);
  const sorted = workflows.toSorted((a, b) => a.id.localeCompare(b.id));

  return (
    <PageContainer pageTitle={tNav('computation')} pageDescription={t('description')}>
      {sorted.length === 0 ? (
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('noWorkflows')}</div>
      ) : (
        <div className='grid gap-4 md:grid-cols-2'>
          {sorted.map((wf) => (
            <DftResultsCard key={wf.id} workflow={wf} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
