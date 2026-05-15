'use client';
// R165-phase-1-oxlint: oxlint cleanup
import { use } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import PageContainer from '@/components/layout/page-container';
import { useMaterial } from '@/lib/firestore/queries/materials';
import { MaterialForm } from '@/features/materials/components/material-form';
// R164-phase-7-integration: lifecycle actions integration
import { LifecycleActions } from '@/components/lifecycle/lifecycle-actions';
import { LifecycleStatusBadge } from '@/components/lifecycle/lifecycle-status-badge';
// R164-phase-8-9b: lineage graph
import { LineageGraph } from '@/components/lineage/lineage-graph';

export default function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const _locale = useLocale();
  const t = useTranslations('materials');
  const { material, loading } = useMaterial(id);

  if (loading) {
    return (
      <PageContainer>
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('loading')}</div>
      </PageContainer>
    );
  }

  if (!material) {
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
            <LifecycleStatusBadge status={material.lifecycleStatus ?? 'active'} />
          </div>
          <LifecycleActions
            entity='materials'
            id={id}
            status={material.lifecycleStatus ?? 'active'}
            i18nNamespace='materials'
          />
        </header>
        <MaterialForm defaultValues={material} materialId={id} />

        {/* R164-phase-8-9b: PROV-O lineage graph */}
        <section className='space-y-2'>
          <details>
            <summary className='cursor-pointer text-sm font-medium hover:text-foreground text-muted-foreground'>
              {`📊 Sơ đồ lineage (PROV-O)`}
            </summary>
            <div className='mt-3'>
              <LineageGraph rootType='material' rootId={id} maxDepth={3} />
            </div>
          </details>
        </section>
      </div>
    </PageContainer>
  );
}
