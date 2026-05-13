import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { ExperimentForm } from '@/features/experiments/components/experiment-form';

export async function generateMetadata() {
  const t = await getTranslations('experiments');
  return { title: t('newPageTitle') };
}

export default async function NewExperimentPage() {
  const t = await getTranslations('experiments');
  return (
    <PageContainer>
      <div className='max-w-3xl mx-auto space-y-6'>
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>{t('newPageTitle')}</h1>
        </header>
        <ExperimentForm />
      </div>
    </PageContainer>
  );
}
