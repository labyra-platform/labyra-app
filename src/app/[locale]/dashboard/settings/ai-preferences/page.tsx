import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { AiPreferencesForm } from '@/features/settings/components/ai-preferences-form';

export default async function AiPreferencesPage() {
  const t = await getTranslations('settings.aiPreferences');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <AiPreferencesForm />
    </PageContainer>
  );
}
