import { getTranslations, getLocale } from 'next-intl/server';
import Link from 'next/link';
import { IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/layout/page-container';
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
