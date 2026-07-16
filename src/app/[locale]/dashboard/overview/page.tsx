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
import { ActivityHeatmap } from '@/features/overview/components/activity-heatmap';
import { AttentionCard } from '@/features/overview/components/attention-card';
import { DashboardHeader } from '@/features/overview/components/dashboard-header';
import { DftRunsCard } from '@/features/overview/components/dft-runs-card';
import { EquipmentBoard } from '@/features/overview/components/equipment-board';
import { GhsCard } from '@/features/overview/components/ghs-card';
import { GroupMembersCard } from '@/features/overview/components/group-members-card';
import { KpiStrip } from '@/features/overview/components/kpi-strip';
import { ProjectsCard } from '@/features/overview/components/projects-card';

export default async function OverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4'>
        <DashboardHeader locale={locale} />
        <KpiStrip />
        {/* R533: one 6-column grid, not four stacked ones.
            Six because the last row is 1:1 and the rows above are thirds —
            3 cannot express a half, 6 expresses both. Each card's span is
            argued from its content, not from what fits:

              attention · members     2 · 2 · 2   thirds
              board 4 | GHS 2         a timeline needs the run; a 3x3 grid of
                                      pictograms wants to stay square
              activity 3 | DFT 3      1:1 — a heatmap of 30 days and a list of
                                      long run names both need the width

            Below lg it stacks in DOM order, so the reading order (problems
            first, then people, then instruments) survives on a phone. */}
        <div className='grid gap-4 lg:grid-cols-6'>
          <div className='lg:col-span-2'>
            <AttentionCard />
          </div>
          <div className='lg:col-span-2'>
            <ProjectsCard />
          </div>
          <div className='lg:col-span-2'>
            <GroupMembersCard />
          </div>

          <div className='lg:col-span-4'>
            <EquipmentBoard />
          </div>
          <div className='lg:col-span-2'>
            <GhsCard />
          </div>

          <div className='lg:col-span-3'>
            <ActivityHeatmap />
          </div>
          <div className='lg:col-span-3'>
            <DftRunsCard />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
