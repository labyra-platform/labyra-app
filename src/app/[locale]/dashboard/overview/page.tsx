/**
 * Dashboard overview (R506) — lab overview.
 *
 * Reading order is the order of the questions a researcher actually asks when
 * they sit down: is anything broken, what is everyone doing, what is running.
 * Problems lead; the rest follows. Mobile stacks in DOM order (= reading
 * order), so the same priority survives on a phone.
 */
import PageContainer from '@/components/layout/page-container';
import { AttentionCard } from '@/features/overview/components/attention-card';
import { ComputationHero } from '@/features/overview/components/computation-hero';
import { DashboardHeader } from '@/features/overview/components/dashboard-header';
import { ExperimentsTrend } from '@/features/overview/components/experiments-trend';
import { GroupMembersCard } from '@/features/overview/components/group-members-card';
import { KpiStrip } from '@/features/overview/components/kpi-strip';
import { ChemicalsMini, EquipmentMini } from '@/features/overview/components/mini-bars';

export default async function OverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4'>
        <DashboardHeader locale={locale} />
        <KpiStrip />
        <div className='grid gap-4 lg:grid-cols-3'>
          <div className='lg:col-span-2'>
            <AttentionCard locale={locale} />
          </div>
          <GroupMembersCard />
        </div>
        <div className='grid gap-4 lg:grid-cols-2'>
          <ComputationHero />
          <ExperimentsTrend />
        </div>
        <div className='grid gap-4 lg:grid-cols-2'>
          <EquipmentMini />
          <ChemicalsMini />
        </div>
      </div>
    </PageContainer>
  );
}
