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
import { SpectraList } from '@/features/spectra/components/spectra-list';
import { SpectrumUploadDialog } from '@/features/spectra/components/spectrum-upload-dialog';
import { NavBack } from '@/components/nav/nav-back';

export default function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('experiments');
  const tSpectra = useTranslations('spectra');
  const { experiment, loading } = useExperiment(id);
  const [uploadOpen, setUploadOpen] = useState(false);

  const handleDelete = async () => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/experiments/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('toastDeleted'));
      router.push(`/${locale}/dashboard/experiments`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };

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
        <Button variant='destructive' onClick={handleDelete}>
          {t('delete')}
        </Button>
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
          <div className='flex justify-end'>
            <Button onClick={() => setUploadOpen(true)} disabled={!firstSampleId}>
              <IconPlus className='size-4' />
              {tSpectra('upload')}
            </Button>
          </div>
          <SpectraList experimentId={id} />
          <SpectrumUploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            experimentId={id}
            sampleId={firstSampleId}
          />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
