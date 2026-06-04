import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';

export default async function ReferencesPage() {
  const t = await getTranslations('nav');

  return (
    <PageContainer pageTitle={t('references')} pageDescription='Coming soon'>
      <div className='text-muted-foreground py-12 text-center text-sm'>
        Citation / BibTeX library — coming soon.
      </div>
    </PageContainer>
  );
}
