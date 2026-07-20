import { IconPlus } from '@tabler/icons-react';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { EquipmentFormSheet } from '@/features/equipment/components/equipment-form-sheet';
import { EquipmentTable } from '@/features/equipment/components/equipment-table';

export async function generateMetadata() {
  const t = await getTranslations('equipment');
  return { title: t('title') };
}

export default async function EquipmentListPage() {
  const t = await getTranslations('equipment');
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <EquipmentFormSheet
          trigger={
            <Button>
              <IconPlus className='size-4' />
              {t('addNew')}
            </Button>
          }
        />
      }
    >
      <EquipmentTable />
    </PageContainer>
  );
}
