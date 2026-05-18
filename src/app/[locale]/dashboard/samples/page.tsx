import { IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
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
