/**
 * Reference cards listing — tenant browse view.
 *
 * Cards are added from spectrum detail pages (R161 4a-pdf flow), not here.
 * This page surfaces the library for review + jump-to-detail.
 *
 * @phase R162-ref-cards-list
 */
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { ReferenceCardsList } from '@/features/spectra/components/reference-cards-list';

export async function generateMetadata() {
  const t = await getTranslations('referenceCards');
  return { title: t('title') };
}

export default async function ReferenceCardsListPage() {
  const t = await getTranslations('referenceCards');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <ReferenceCardsList />
    </PageContainer>
  );
}
