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
import PageContainer from '@/components/layout/page-container';
import { ComputationTabs } from '@/features/computation/components/computation-tabs';
import { DftComposeView } from '@/features/computation/components/dft-compose-view';
import { reducedFormula } from '@/features/crystal-structures/structure-row';
import { getCurrentTenantId } from '@/lib/auth/server';
import { listCrystalStructures } from '@/lib/firebase/crystal-structures/service';
import { listComposeStates, listDftProjects } from '@/lib/firebase/dft/project-service';
import { listDftWorkflows } from '@/lib/firebase/dft/service';

export const dynamic = 'force-dynamic';

export default async function ComputationComposePage({
  searchParams
}: {
  searchParams: Promise<{ structure?: string; project?: string }>;
}) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) notFound();
  const [workflows, structures, projects] = await Promise.all([
    listDftWorkflows(tenantId),
    listCrystalStructures(tenantId),
    listDftProjects(tenantId)
  ]);
  const runs = workflows.map((w) => ({ id: w.id, name: w.global?.prefix ?? w.id }));
  const structureRefs = structures.map((c) => ({
    id: c.id,
    name: c.name,
    formula: reducedFormula(c.structure),
    mpId: c.mpId
  }));
  const { structure: initialStructureId, project: projectId } = await searchParams;
  const projectRefs = projects.map((p) => ({
    id: p.id,
    name: p.name,
    structureIds: p.structureIds
  }));
  // Saved compose states for the active project, so an in-progress workflow can
  // be restored instead of starting from the archetype default.
  const savedStates = projectId ? await listComposeStates(tenantId, projectId) : [];

  return (
    <PageContainer>
      <ComputationTabs />
      <DftComposeView
        runs={runs}
        structures={structureRefs}
        initialStructureId={initialStructureId}
        projectId={projectId}
        projects={projectRefs}
        savedStates={savedStates}
      />
    </PageContainer>
  );
}
