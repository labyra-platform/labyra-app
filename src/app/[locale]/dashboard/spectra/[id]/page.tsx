'use client';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/layout/page-container';
import { useSpectrum } from '@/lib/firestore/queries/spectra';
import { SpectrumDetailCard } from '@/features/spectra/components/spectrum-detail-card';

import { SpectrumAnalysisSection } from '@/features/spectra/components/spectrum-analysis-section';
export default function SpectrumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('spectra');
  const { spectrum, loading } = useSpectrum(id);

  const handleDelete = async () => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/spectra/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('toastDeleted'));
      router.push(`/${locale}/dashboard/spectra`);
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

  if (!spectrum) {
    return (
      <PageContainer>
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('notFound')}</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={spectrum.originalFilename}
      pageDescription={`${spectrum.spectrumType.toUpperCase()} · ${spectrum.experimentId}`}
      pageHeaderAction={
        <Button variant='destructive' onClick={handleDelete}>
          {t('delete')}
        </Button>
      }
    >
      <SpectrumDetailCard spectrum={spectrum} />
      {/* R160-spectra-3b-analysis-render */}
      <SpectrumAnalysisSection spectrumId={spectrum.id} status={spectrum.status} />
    </PageContainer>
  );
}
