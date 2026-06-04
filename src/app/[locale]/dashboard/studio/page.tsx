import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';

export default async function StudioPage() {
  const t = await getTranslations('nav');

  return (
    <PageContainer pageTitle={t('studio')} pageDescription='Coming soon'>
      <div className='text-muted-foreground py-12 text-center text-sm'>
        Figure Studio (publication-ready band / DOS figures) — coming soon.
      </div>
    </PageContainer>
  );
}
