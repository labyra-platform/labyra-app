import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { ChemicalForm } from '@/features/chemicals/components/chemical-form';

export default async function NewChemicalPage() {
  const t = await getTranslations('chemicals');
  return (
    <PageContainer pageTitle={t('addNew')} pageDescription={t('subtitle')}>
      <ChemicalForm />
    </PageContainer>
  );
}
