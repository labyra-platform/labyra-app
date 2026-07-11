import { getTranslations } from 'next-intl/server';

import PageContainer from '@/components/layout/page-container';
import { AccountSettings } from '@/features/settings/components/account-settings';

export default async function AccountSettingsPage() {
  const t = await getTranslations('settings.account');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <AccountSettings />
    </PageContainer>
  );
}
