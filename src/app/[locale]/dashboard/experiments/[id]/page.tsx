'use client';
import { IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { use, useState } from 'react';
import PageContainer from '@/components/layout/page-container';
// R164-phase-7-integration: lifecycle actions integration
import { LifecycleActions } from '@/components/lifecycle/lifecycle-actions';
// R164-phase-8-9b: lineage graph
import { LineageGraph } from '@/components/lineage/lineage-graph';
import { NavBack } from '@/components/nav/nav-back';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExperimentForm } from '@/features/experiments/components/experiment-form';
import { DemoDataButton } from '@/features/spectra/components/demo-data-button';
import { SpectraList } from '@/features/spectra/components/spectra-list';
import { SpectrumUploadDialog } from '@/features/spectra/components/spectrum-upload-dialog';
import { useExperiment } from '@/lib/firestore/queries/experiments';

export default function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const _router = useRouter();
  const locale = useLocale();
  const t = useTranslations('experiments');
  const tSpectra = useTranslations('spectra');
  const { experiment, loading } = useExperiment(id);
  const [uploadOpen, setUploadOpen] = useState(false);
  // R162-demo-visibility — page-level demo preload
  const [pendingDemo, setPendingDemo] = useState<
    { file: File; formula: string; anode: string; monochromator: string } | undefined
  >(undefined);

  if (loading) {
    return (
      <PageContainer>
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('loading')}</div>
      </PageContainer>
    );
  }
  if (!experiment) {
    return (
      <PageContainer>
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('notFound')}</div>
      </PageContainer>
    );
  }

  // For sample linkage in spectrum upload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = experiment as any;
  const firstSampleId = data.sampleIds?.[0] ?? '';

  return (
    <PageContainer
      pageTitle={t('editPageTitle')}
      pageHeaderAction={
        <LifecycleActions
          entity='experiments'
          id={id}
          status={experiment.lifecycleStatus ?? 'active'}
          i18nNamespace='experiments'
        />
      }
    >
      <NavBack fallback={`/${locale}/dashboard/experiments`} label='Back to experiments' />
      <Tabs defaultValue='edit' className='w-full'>
        <TabsList>
          <TabsTrigger value='edit'>{t('tabEdit')}</TabsTrigger>
          <TabsTrigger value='spectra'>{t('tabSpectra')}</TabsTrigger>
        </TabsList>

        <TabsContent value='edit' className='mt-6'>
          <ExperimentForm defaultValues={experiment} experimentId={id} />
        </TabsContent>

        <TabsContent value='spectra' className='mt-6 space-y-4'>
          <div className='flex justify-end gap-2'>
            {/* R162-demo-visibility — page-level demo entry point */}
            <DemoDataButton
              disabled={!firstSampleId}
              onLoad={(file, prefilled) => {
                setPendingDemo({ file, ...prefilled });
                setUploadOpen(true);
              }}
            />
            <Button onClick={() => setUploadOpen(true)} disabled={!firstSampleId}>
              <IconPlus className='size-4' />
              {tSpectra('upload')}
            </Button>
          </div>
          <SpectraList experimentId={id} />
          <SpectrumUploadDialog
            open={uploadOpen}
            onOpenChange={(open) => {
              setUploadOpen(open);
              if (!open) setPendingDemo(undefined);
            }}
            experimentId={id}
            sampleId={firstSampleId}
            initialDemo={pendingDemo}
          />
        </TabsContent>
      </Tabs>

      {/* R164-phase-8-9b: PROV-O lineage graph */}
      <section className='space-y-2'>
        <details>
          <summary className='cursor-pointer text-sm font-medium hover:text-foreground text-muted-foreground'>
            {`📊 Sơ đồ lineage (PROV-O)`}
          </summary>
          <div className='mt-3'>
            <LineageGraph rootType='experiment' rootId={id} maxDepth={3} />
          </div>
        </details>
      </section>
    </PageContainer>
  );
}
