/**
 * Dashboard overview (R493) — computation-first bento.
 * Desktop: [Hero (tall) | KPI trio / Today] · [Experiments trend, full] ·
 * [Equipment | Chemicals]. Mobile stacks in DOM order (= reading order).
 */
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { ComputationHero } from '@/features/overview/components/computation-hero';
import { ExperimentsTrend } from '@/features/overview/components/experiments-trend';
import { KpiCards } from '@/features/overview/components/kpi-cards';
import { ChemicalsMini, EquipmentMini } from '@/features/overview/components/mini-bars';
import { TodayCard } from '@/features/overview/components/today-card';

export default async function OverviewPage() {
  const t = await getTranslations('common');
  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4'>
        <h2 className='text-2xl font-bold tracking-tight'>{t('welcomeBack')}</h2>
        <div className='grid gap-4 lg:grid-cols-2'>
          <div className='lg:row-span-2'>
            <ComputationHero />
          </div>
          <KpiCards />
          <TodayCard />
          <div className='lg:col-span-2'>
            <ExperimentsTrend />
          </div>
          <EquipmentMini />
          <ChemicalsMini />
        </div>
      </div>
    </PageContainer>
  );
}
