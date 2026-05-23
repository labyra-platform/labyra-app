import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { LabContextForm } from '@/features/settings/components/lab-context-form';

export default async function LabContextPage() {
  const t = await getTranslations('settings.labContext');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <LabContextForm />
    </PageContainer>
  );
}
