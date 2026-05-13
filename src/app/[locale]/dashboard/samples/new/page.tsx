import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { SampleForm } from '@/features/samples/components/sample-form';

export async function generateMetadata() {
  const t = await getTranslations('samples');
  return { title: t('newPageTitle') };
}

export default async function NewSamplePage() {
  const t = await getTranslations('samples');
  return (
    <PageContainer>
      <div className='max-w-3xl mx-auto space-y-6'>
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>{t('newPageTitle')}</h1>
        </header>
        <SampleForm />
      </div>
    </PageContainer>
  );
}
