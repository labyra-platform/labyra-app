import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';

export default async function ComputationPage() {
  const t = await getTranslations('nav');

  return (
    <PageContainer pageTitle={t('computation')} pageDescription='Coming soon'>
      <div className='text-muted-foreground py-12 text-center text-sm'>
        Computation jobs (DFT / MD / ML potential) — coming soon.
      </div>
    </PageContainer>
  );
}
