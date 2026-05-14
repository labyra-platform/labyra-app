'use client';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/layout/page-container';
import { useMaterial } from '@/lib/firestore/queries/materials';
import { MaterialForm } from '@/features/materials/components/material-form';

export default function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('materials');
  const { material, loading } = useMaterial(id);

  const handleDelete = async () => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/materials/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('toastDeleted'));
      router.push(`/${locale}/dashboard/materials`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toastDeleted'));
    }
  };

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
          <h1 className='text-2xl font-semibold tracking-tight'>{t('editPageTitle')}</h1>
          <Button variant='destructive' onClick={handleDelete}>
            {t('delete')}
          </Button>
        </header>
        <MaterialForm defaultValues={material} materialId={id} />
      </div>
    </PageContainer>
  );
}
