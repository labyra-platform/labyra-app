/**
 * Computation page — DFT workflows, node-DAG builder, and templates.
 *
 * Path: /[locale]/dashboard/computation
 *
 * Server Component: reads tenants/{tenantId}/dftWorkflows via the server-only
 * service. Tab chrome is a client wrapper; server-rendered content is slotted in.
 *
 * @phase R241-dag-editor
 */
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { ComputationTabs } from '@/features/computation/components/computation-tabs';
import { DftResultsCard } from '@/features/computation/components/dft-results-card';
import { DftTemplateCard } from '@/features/computation/components/dft-template-card';
import { DFT_TEMPLATES } from '@/features/computation/templates';
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

  const workflowsSlot =
    sorted.length === 0 ? (
      <div className='text-muted-foreground py-12 text-center text-sm'>{t('noWorkflows')}</div>
    ) : (
      <div className='grid gap-4 md:grid-cols-2'>
        {sorted.map((wf) => (
          <DftResultsCard key={wf.id} workflow={wf} />
        ))}
      </div>
    );

  const templatesSlot = (
    <div className='grid gap-4 md:grid-cols-2'>
      {DFT_TEMPLATES.map((tpl) => (
        <DftTemplateCard key={tpl.id} template={tpl} />
      ))}
    </div>
  );

  return (
    <PageContainer pageTitle={tNav('computation')} pageDescription={t('description')}>
      <ComputationTabs
        labels={{
          workflows: t('tabs.workflows'),
          builder: t('tabs.builder'),
          templates: t('tabs.templates')
        }}
        workflowsSlot={workflowsSlot}
        templatesSlot={templatesSlot}
      />
    </PageContainer>
  );
}
