import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { AiPreferencesForm } from '@/features/settings/components/ai-preferences-form';
import { RememberedFacts } from '@/features/settings/components/remembered-facts';

export default async function AiPreferencesPage() {
  const t = await getTranslations('settings.aiPreferences');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <AiPreferencesForm />
      <div className='mt-6'>
        <RememberedFacts />
      </div>
    </PageContainer>
  );
}
