import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { FeatureAccessForm } from '@/features/settings/components/feature-access-form';

export default async function FeatureAccessPage() {
  const t = await getTranslations('settings.featureAccess');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <FeatureAccessForm />
    </PageContainer>
  );
}
