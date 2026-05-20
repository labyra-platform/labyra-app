'use client';

import { IconChartDots3, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { CrossSpectrumPanel } from '@/components/deviation/cross-spectrum-panel';
import { useLocale, useTranslations } from 'next-intl';
// R165-phase-1-oxlint: oxlint cleanup
import { use } from 'react';
import PageContainer from '@/components/layout/page-container';
// R164-phase-7-integration: lifecycle actions integration
import { LifecycleActions } from '@/components/lifecycle/lifecycle-actions';
import { LifecycleStatusBadge } from '@/components/lifecycle/lifecycle-status-badge';
// R164-phase-8-9b: lineage graph
import { LineageGraph } from '@/components/lineage/lineage-graph';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SampleForm } from '@/features/samples/components/sample-form';
import { SpectraList } from '@/features/spectra/components/spectra-list';
import { SpectrumUploadDialog } from '@/features/spectra/components/spectrum-upload-dialog';
import { useSample } from '@/lib/firestore/queries/samples';

export default function SampleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const _locale = useLocale();
  const t = useTranslations('samples');
  const tSpectra = useTranslations('spectra');
  const [uploadOpen, setUploadOpen] = useState(false);
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
      <div className='space-y-6'>
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
        <Tabs defaultValue='edit' className='w-full'>
          <TabsList>
            <TabsTrigger value='edit'>{t('tabEdit')}</TabsTrigger>
            <TabsTrigger value='measurements'>{tSpectra('title')}</TabsTrigger>
          </TabsList>

          <TabsContent value='edit' className='mt-6'>
            <SampleForm defaultValues={sample} sampleId={id} />
          </TabsContent>

          <TabsContent value='measurements' className='mt-6 space-y-4'>
            {/* R186-2b: measurement upload lives on the sample */}
            <div className='flex justify-end'>
              <Button onClick={() => setUploadOpen(true)}>
                <IconPlus className='size-4' />
                {tSpectra('upload')}
              </Button>
            </div>
            <SpectraList sampleId={id} />
            <SpectrumUploadDialog
              open={uploadOpen}
              onOpenChange={setUploadOpen}
              experimentId={sample.experimentId}
              sampleId={id}
              sampleLabel={sample.sampleCode}
            />
          </TabsContent>
        </Tabs>

        {/* R164-phase-8-9b: PROV-O lineage graph */}
        <section className='space-y-2'>
          <details>
            <summary className='cursor-pointer text-sm font-medium hover:text-foreground text-muted-foreground flex items-center gap-2'>
              <IconChartDots3 className='h-4 w-4' aria-hidden='true' />
              {t('lineageGraphTitle')}
            </summary>
            <div className='mt-3'>
              <LineageGraph rootType='sample' rootId={id} maxDepth={3} />
            </div>
          </details>
        </section>

        {/* R185-10c: Cross-spectrum inference */}
        <CrossSpectrumPanel sampleId={id} />
      </div>
    </PageContainer>
  );
}
