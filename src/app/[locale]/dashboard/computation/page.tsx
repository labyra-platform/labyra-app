/**
 * Computation page — DFT workflows.
 *
 * Path: /[locale]/dashboard/computation
 *
 * Server Component: reads tenants/{tenantId}/dftWorkflows via the server-only
 * service and lists each workflow as a card (results + LR status DAG).
 *
 * NOTE (R251 pivot): the earlier Workflows/Builder/Templates tab frame (R239) and
 * the input-on-node editor (R241-246) were removed — they predated the workflow
 * node-graph + DFT architecture reports and did not match them. DFT is pipeline-
 * style (status DAG + node panel), composed in a per-workflow workspace (§10.1),
 * which the following slices build. Templates = preset workflow = §10.3 v1 (defer).
 *
 * @phase R251-computation-pivot
 */
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { ComputationTabs } from '@/features/computation/components/computation-tabs';
import { DftWorkflowTable } from '@/features/computation/components/dft-workflow-table';
import { toWorkflowRow } from '@/features/computation/workflow-row';
import { getCurrentTenantId } from '@/lib/auth/server';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { JobsAutoRefresh } from '@/features/computation/components/jobs-auto-refresh';
import { listDftWorkflows } from '@/lib/firebase/dft/service';

export const dynamic = 'force-dynamic';

export default async function ComputationPage() {
  const t = await getTranslations('computation');
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    notFound();
  }
  const workflows = await listDftWorkflows(tenantId);
  const rows = workflows.map(toWorkflowRow);
  const anyActive = rows.some((r) => r.status === 'running' || r.status === 'queued');

  // Legacy jobs stored an email in createdBy — resolve the distinct emails to
  // display names so the table shows a person's name, not an email. New jobs
  // already store the name. Best-effort: fall back to the email on any failure.
  const creatorNames: Record<string, string> = {};
  const emails = [
    ...new Set(rows.map((r) => r.createdBy).filter((c): c is string => !!c && c.includes('@')))
  ];
  if (emails.length > 0) {
    const auth = getAdminAuthService();
    await Promise.all(
      emails.map(async (email) => {
        try {
          const u = await auth.getUserByEmail(email);
          if (u.displayName) creatorNames[email] = u.displayName;
        } catch {
          /* keep email */
        }
      })
    );
  }

  return (
    <PageContainer>
      <JobsAutoRefresh active={anyActive} />
      <ComputationTabs />
      {rows.length === 0 ? (
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('noWorkflows')}</div>
      ) : (
        <DftWorkflowTable rows={rows} creatorNames={creatorNames} />
      )}
    </PageContainer>
  );
}
