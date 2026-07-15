import { getTranslations } from 'next-intl/server';

import PageContainer from '@/components/layout/page-container';
import { AccountSettings } from '@/features/settings/components/account-settings';
import { DisplayUnitsForm } from '@/features/settings/components/display-units-form';

export default async function AccountSettingsPage() {
  const t = await getTranslations('settings.account');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <div className='max-w-2xl space-y-6'>
        <AccountSettings />
        <DisplayUnitsForm />
      </div>
    </PageContainer>
  );
}
