import { IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { MaterialsTable } from '@/features/materials/components/materials-table';

export async function generateMetadata() {
  const t = await getTranslations('materials');
  return { title: t('title') };
}

export default async function MaterialsListPage() {
  const t = await getTranslations('materials');
  const locale = await getLocale();
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <Button asChild>
          <Link href={`/${locale}/dashboard/materials/new`}>
            <IconPlus className='size-4' />
            {t('addNew')}
          </Link>
        </Button>
      }
    >
      <MaterialsTable />
    </PageContainer>
  );
}
