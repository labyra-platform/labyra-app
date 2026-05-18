'use client';
import { getAuth } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { use } from 'react';
import { toast } from 'sonner';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { EquipmentForm } from '@/features/equipment/components/equipment-form';
import { useEquipment } from '@/lib/firestore/queries/equipment';

export default function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('equipment');
  const { equipment, loading } = useEquipment(id);

  const handleDelete = async () => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/equipment/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('toastDeleted'));
      router.push(`/${locale}/dashboard/equipment`);
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

  if (!equipment) {
    return (
      <PageContainer>
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('notFound')}</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={t('editPageTitle')}
      pageHeaderAction={
        <Button variant='destructive' onClick={handleDelete}>
          {t('delete')}
        </Button>
      }
    >
      <EquipmentForm defaultValues={equipment} equipmentId={id} />
    </PageContainer>
  );
}
