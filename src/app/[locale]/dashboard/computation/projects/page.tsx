/**
 * DFT Projects page — group structures into projects and launch compose. Server
 * Component: lists the tenant's crystal structures (for import) and hands them to
 * the client ProjectsView.
 *
 * Path: /[locale]/dashboard/computation/projects
 *
 * @phase R376-projects
 */
import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { ComputationTabs } from '@/features/computation/components/computation-tabs';
import { ProjectsView } from '@/features/computation/components/projects-view';
import { getCurrentTenantId } from '@/lib/auth/server';
import { listCrystalStructures } from '@/lib/firebase/crystal-structures/service';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) notFound();
  const structures = await listCrystalStructures(tenantId);
  const lite = structures.map((s) => ({
    id: s.id,
    name: s.name,
    mpId: s.mpId
  }));

  return (
    <PageContainer>
      <ComputationTabs />
      <ProjectsView structures={lite} />
    </PageContainer>
  );
}
