'use client';
import { useLocale, useTranslations } from 'next-intl';
// R165-phase-1-oxlint: oxlint cleanup
import { use } from 'react';
import PageContainer from '@/components/layout/page-container';
// R164-phase-7-integration: lifecycle actions integration
import { LifecycleActions } from '@/components/lifecycle/lifecycle-actions';
import { LifecycleStatusBadge } from '@/components/lifecycle/lifecycle-status-badge';
// R164-phase-8-9b: lineage graph
import { MaterialForm } from '@/features/materials/components/material-form';
// R231-a: scientific reference data (MaterialProfile by formula)
import { MaterialKnowledgePanel } from '@/features/samples/components/material-knowledge-panel';
import { useMaterial } from '@/lib/firestore/queries/materials';

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

        {/* R231-a: scientific reference sections. Modular — future computer-vision
            (SEM/TEM imagery + morphology analysis) plugs in as another section here. */}
        {material.formula && material.formula.trim().length >= 2 && (
          <section className='space-y-3'>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-semibold tracking-tight'>{t('scientificData')}</h2>
            </div>
            <MaterialKnowledgePanel formula={material.formula} />
          </section>
        )}
      </div>
    </PageContainer>
  );
}
