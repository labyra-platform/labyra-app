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
import { IconArrowLeft } from '@tabler/icons-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { DftWorkflowWorkspace } from '@/features/computation/components/dft-workflow-workspace';
import { Link } from '@/i18n/navigation';
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
    <PageContainer>
      <Button asChild variant='ghost' size='sm' className='-ml-2 mb-2 w-fit'>
        <Link href='/dashboard/computation'>
          <IconArrowLeft className='mr-1 size-4' />
          {t('backToJobs')}
        </Link>
      </Button>
      <DftWorkflowWorkspace workflow={workflow} />
    </PageContainer>
  );
}
