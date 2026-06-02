import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { ManuscriptsView } from '@/features/manuscript/components/manuscripts-view';

export async function generateMetadata() {
  const t = await getTranslations('manuscript');
  return { title: t('title') };
}

export default async function ManuscriptsPage() {
  const t = await getTranslations('manuscript');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <ManuscriptsView />
    </PageContainer>
  );
}
