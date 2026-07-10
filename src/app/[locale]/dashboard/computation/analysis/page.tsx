/**
 * Computation analysis page — derived electrochemistry from DFT total energies.
 * Tools: HER free-energy (ΔG_H*) and band alignment. Passes completed workflows
 * (with their parsed energies) so the tools can auto-fill instead of manual entry.
 * Path: /[locale]/dashboard/computation/analysis.
 */
import PageContainer from '@/components/layout/page-container';
import { ComputationTabs } from '@/features/computation/components/computation-tabs';
import { DftAnalysisView } from '@/features/computation/components/dft-analysis-view';
import { getCurrentTenantId } from '@/lib/auth/server';
import { listDftWorkflows } from '@/lib/firebase/dft/service';

export const dynamic = 'force-dynamic';

export default async function ComputationAnalysisPage() {
  const tenantId = await getCurrentTenantId();
  const workflows = tenantId
    ? (await listDftWorkflows(tenantId))
        .filter((w) => w.results != null)
        .map((w) => ({
          id: w.id,
          name: w.global?.prefix ?? w.id,
          energyRy: typeof w.results?.totalEnergyRy === 'number' ? w.results.totalEnergyRy : null,
          vbmEv: w.results?.bandGap?.vbm_ev ?? null,
          cbmEv: w.results?.bandGap?.cbm_ev ?? null
        }))
        .toSorted((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <PageContainer>
      <ComputationTabs />
      <DftAnalysisView workflows={workflows} />
    </PageContainer>
  );
}
