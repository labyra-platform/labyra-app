'use client';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
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
  const { material, loading } = useMaterial(id);

  const handleDelete = async () => {
    if (!confirm('Xóa material này?')) return;
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/materials/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Đã xóa');
      router.push(`/${locale}/dashboard/materials`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi');
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className='text-muted-foreground py-12 text-center text-sm'>Đang tải...</div>
      </PageContainer>
    );
  }

  if (!material) {
    return (
      <PageContainer>
        <div className='text-muted-foreground py-12 text-center text-sm'>Không tìm thấy</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className='max-w-3xl mx-auto space-y-6'>
        <header className='flex items-center justify-between'>
          <h1 className='text-2xl font-semibold tracking-tight'>Chỉnh sửa material</h1>
          <Button variant='destructive' onClick={handleDelete}>
            Xóa
          </Button>
        </header>
        <MaterialForm defaultValues={material} materialId={id} />
      </div>
    </PageContainer>
  );
}
