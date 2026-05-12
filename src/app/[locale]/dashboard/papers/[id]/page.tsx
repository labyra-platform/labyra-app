import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { PaperDetail } from '@/features/papers/components/paper-detail';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('papers');
  const { id } = await params;
  return { title: `${t('detailPageTitle')} — ${id.slice(0, 8)}` };
}

export default async function PaperDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageContainer>
      <PaperDetail paperId={id} />
    </PageContainer>
  );
}
