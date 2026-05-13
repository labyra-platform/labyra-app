import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { MaterialForm } from '@/features/materials/components/material-form';

export async function generateMetadata() {
  const t = await getTranslations('materials');
  return { title: t('newPageTitle') };
}

export default async function NewMaterialPage() {
  const t = await getTranslations('materials');
  return (
    <PageContainer>
      <div className='max-w-3xl mx-auto space-y-6'>
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>{t('newPageTitle')}</h1>
        </header>
        <MaterialForm />
      </div>
    </PageContainer>
  );
}
