/**
 * Computation analysis page — derived electrochemistry from DFT total energies.
 * Round 1: HER free-energy (ΔG_H*) via CHE.
 * Path: /[locale]/dashboard/computation/analysis.
 */
import PageContainer from '@/components/layout/page-container';
import { ComputationTabs } from '@/features/computation/components/computation-tabs';
import { DftAnalysisView } from '@/features/computation/components/dft-analysis-view';

export default function ComputationAnalysisPage() {
  return (
    <PageContainer>
      <ComputationTabs />
      <DftAnalysisView />
    </PageContainer>
  );
}
