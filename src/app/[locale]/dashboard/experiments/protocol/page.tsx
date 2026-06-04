import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';

export default async function ExperimentProtocolPage() {
  const t = await getTranslations('nav');

  return (
    <PageContainer pageTitle={t('protocol')} pageDescription='Coming soon'>
      <div className='text-muted-foreground py-12 text-center text-sm'>
        Protocol instance for an experiment — coming soon.
      </div>
    </PageContainer>
  );
}
