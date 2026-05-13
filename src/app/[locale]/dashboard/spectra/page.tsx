import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { SpectraTableAll } from '@/features/spectra/components/spectra-table-all';

export async function generateMetadata() {
  const t = await getTranslations('spectra');
  return { title: t('title') };
}

export default async function SpectraListPage() {
  const t = await getTranslations('spectra');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <SpectraTableAll />
    </PageContainer>
  );
}
