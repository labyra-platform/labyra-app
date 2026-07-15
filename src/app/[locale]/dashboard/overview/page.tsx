/**
 * Dashboard overview (R506–R507) — lab overview.
 *
 * Ordered by the questions a researcher asks on sitting down: is anything
 * broken (attention), who is around (members), what is on the instruments
 * today (board), what has the lab been doing (activity), what is computing
 * (DFT), what are we handling (GHS). Problems lead. Mobile stacks in DOM
 * order, so the same priority survives on a phone.
 */
import PageContainer from '@/components/layout/page-container';
import { ActivityChart } from '@/features/overview/components/activity-chart';
import { AttentionCard } from '@/features/overview/components/attention-card';
import { DashboardHeader } from '@/features/overview/components/dashboard-header';
import { DftRunsCard } from '@/features/overview/components/dft-runs-card';
import { EquipmentBoard } from '@/features/overview/components/equipment-board';
import { GhsCard } from '@/features/overview/components/ghs-card';
import { GroupMembersCard } from '@/features/overview/components/group-members-card';
import { KpiStrip } from '@/features/overview/components/kpi-strip';

export default async function OverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4'>
        <DashboardHeader locale={locale} />
        <KpiStrip />
        {/* §11: one ratio, repeated — 1.75fr/1fr, with minmax(0,1fr) so a long
            run name can't blow out the column (grid defaults to min-width:auto). */}
        <div className='grid gap-4 lg:grid-cols-[1.75fr_minmax(0,1fr)]'>
          <AttentionCard />
          <GroupMembersCard />
        </div>
        <EquipmentBoard />
        <div className='grid gap-4 lg:grid-cols-[1.75fr_minmax(0,1fr)]'>
          <ActivityChart />
          <GhsCard />
        </div>
        <DftRunsCard />
      </div>
    </PageContainer>
  );
}
