import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { LineageExplorer } from '@/features/lineage/components/lineage-explorer';

// @phase R165-phase-7-lineage-page
export async function generateMetadata() {
  const t = await getTranslations('nav');
  return { title: t('lineage') };
}

export default async function LineagePage() {
  const t = await getTranslations('lineage.explorer');

  return (
    <PageContainer pageTitle={t('pageTitle')} pageDescription={t('pageDescription')}>
      <LineageExplorer />
    </PageContainer>
  );
}
