import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';

export default async function ProtocolTemplatesPage() {
  const t = await getTranslations('nav');

  return (
    <PageContainer pageTitle={t('protocolTemplates')} pageDescription='Coming soon'>
      <div className='text-muted-foreground py-12 text-center text-sm'>
        Reusable protocol template library — coming soon.
      </div>
    </PageContainer>
  );
}
