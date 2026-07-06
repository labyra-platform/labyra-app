/**
 * Computation reference page — a documentation source explaining every DFT/QE
 * parameter the composer exposes (meaning, typical value, unit, citations).
 * Path: /[locale]/dashboard/computation/reference. @phase R393
 */
import PageContainer from '@/components/layout/page-container';
import { ComputationTabs } from '@/features/computation/components/computation-tabs';
import { DftReferenceView } from '@/features/computation/components/dft-reference-view';

export default function ComputationReferencePage() {
  return (
    <PageContainer>
      <ComputationTabs />
      <DftReferenceView />
    </PageContainer>
  );
}
