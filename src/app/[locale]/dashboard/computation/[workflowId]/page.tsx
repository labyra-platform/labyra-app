/**
 * DFT workflow workspace — one computation's pipeline (report DFT §10.1).
 *
 * Path: /[locale]/dashboard/computation/[workflowId]
 *
 * Server Component: loads the workflow via the server-only service, then hands
 * it to the client workspace (left rail + canvas tabs + node panel).
 *
 * @phase R252-dft-workspace-shell
 */
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { DftWorkflowWorkspace } from '@/features/computation/components/dft-workflow-workspace';
import { getCurrentTenantId } from '@/lib/auth/server';
import { getDftWorkflow } from '@/lib/firebase/dft/service';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ workflowId: string }>;
}

export default async function DftWorkflowPage({ params }: PageProps) {
  const { workflowId } = await params;
  const t = await getTranslations('computation');
  const tenantId = await getCurrentTenantId();
  if (!tenantId) notFound();
  const workflow = await getDftWorkflow(tenantId, workflowId);
  if (!workflow) notFound();

  return (
    <PageContainer
      pageTitle={workflow.global?.prefix ?? workflow.id}
      pageDescription={t('workspaceDescription')}
    >
      <DftWorkflowWorkspace workflow={workflow} />
    </PageContainer>
  );
}
