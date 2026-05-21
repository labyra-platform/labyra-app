import { IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { ChemicalsTable } from '@/features/chemicals/components/chemicals-table';

export async function generateMetadata() {
  const t = await getTranslations('chemicals');
  return { title: t('title') };
}

export default async function ChemicalsListPage() {
  const t = await getTranslations('chemicals');
  const locale = await getLocale();
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <Button asChild>
          <Link href={`/${locale}/dashboard/chemicals/new`}>
            <IconPlus className='size-4' />
            {t('addNew')}
          </Link>
        </Button>
      }
    >
      <ChemicalsTable />
    </PageContainer>
  );
}
