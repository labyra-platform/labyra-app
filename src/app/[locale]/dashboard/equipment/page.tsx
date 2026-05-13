import { getTranslations, getLocale } from 'next-intl/server';
import Link from 'next/link';
import { IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/layout/page-container';
import { EquipmentTable } from '@/features/equipment/components/equipment-table';

export async function generateMetadata() {
  const t = await getTranslations('equipment');
  return { title: t('title') };
}

export default async function EquipmentListPage() {
  const t = await getTranslations('equipment');
  const locale = await getLocale();
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <Button asChild>
          <Link href={`/${locale}/dashboard/equipment/new`}>
            <IconPlus className='size-4' />
            {t('addNew')}
          </Link>
        </Button>
      }
    >
      <EquipmentTable />
    </PageContainer>
  );
}
