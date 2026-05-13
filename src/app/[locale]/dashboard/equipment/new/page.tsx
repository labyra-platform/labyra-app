import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { EquipmentForm } from '@/features/equipment/components/equipment-form';

export async function generateMetadata() {
  const t = await getTranslations('equipment');
  return { title: t('newPageTitle') };
}

export default async function NewEquipmentPage() {
  const t = await getTranslations('equipment');
  return (
    <PageContainer pageTitle={t('newPageTitle')}>
      <EquipmentForm />
    </PageContainer>
  );
}
