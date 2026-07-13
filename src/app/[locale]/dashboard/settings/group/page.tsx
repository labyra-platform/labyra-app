import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { GroupMembers } from '@/features/settings/components/group-members';

export default async function GroupSettingsPage() {
  const t = await getTranslations('settings.group');
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <GroupMembers />
    </PageContainer>
  );
}
