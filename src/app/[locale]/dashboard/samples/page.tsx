import { getTranslations, getLocale } from 'next-intl/server';
import Link from 'next/link';
import { IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/layout/page-container';
import { SamplesTable } from '@/features/samples/components/samples-table';

export async function generateMetadata() {
  const t = await getTranslations('samples');
  return { title: t('title') };
}

export default async function SamplesListPage() {
  const t = await getTranslations('samples');
  const locale = await getLocale();
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <Button asChild>
          <Link href={`/${locale}/dashboard/samples/new`}>
            <IconPlus className='size-4' />
            {t('addNew')}
          </Link>
        </Button>
      }
    >
      <SamplesTable />
    </PageContainer>
  );
}
