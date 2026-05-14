'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import { IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageContainer from '@/components/layout/page-container';
import { useExperiment } from '@/lib/firestore/queries/experiments';
import { ExperimentForm } from '@/features/experiments/components/experiment-form';
// R164-phase-7-integration: lifecycle actions integration
import { LifecycleActions } from '@/components/lifecycle/lifecycle-actions';
import { LifecycleStatusBadge } from '@/components/lifecycle/lifecycle-status-badge';
import { SpectraList } from '@/features/spectra/components/spectra-list';
import { SpectrumUploadDialog } from '@/features/spectra/components/spectrum-upload-dialog';
import { DemoDataButton } from '@/features/spectra/components/demo-data-button';
import { NavBack } from '@/components/nav/nav-back';

export default function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
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
  const firstSampleId = (data.sampleIds && data.sampleIds[0]) ?? '';

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
    </PageContainer>
  );
}
