'use client';
import { use } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import PageContainer from '@/components/layout/page-container';
import { useSample } from '@/lib/firestore/queries/samples';
import { SampleForm } from '@/features/samples/components/sample-form';
// R164-phase-7-integration: lifecycle actions integration
import { LifecycleActions } from '@/components/lifecycle/lifecycle-actions';
import { LifecycleStatusBadge } from '@/components/lifecycle/lifecycle-status-badge';

export default function SampleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const locale = useLocale();
  const t = useTranslations('samples');
  const { sample, loading } = useSample(id);

  if (loading) {
    return (
      <PageContainer>
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('loading')}</div>
      </PageContainer>
    );
  }

  if (!sample) {
    return (
      <PageContainer>
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('notFound')}</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className='max-w-3xl mx-auto space-y-6'>
        <header className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <h1 className='text-2xl font-semibold tracking-tight'>{t('editPageTitle')}</h1>
            <LifecycleStatusBadge status={sample.lifecycleStatus ?? 'active'} />
          </div>
          <LifecycleActions
            entity='samples'
            id={id}
            status={sample.lifecycleStatus ?? 'active'}
            i18nNamespace='samples'
          />
        </header>
        <SampleForm defaultValues={sample} sampleId={id} />
      </div>
    </PageContainer>
  );
}
