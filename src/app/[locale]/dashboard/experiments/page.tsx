import { getTranslations, getLocale } from 'next-intl/server';
import Link from 'next/link';
import { IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/layout/page-container';
import { ExperimentsTable } from '@/features/experiments/components/experiments-table';

export async function generateMetadata() {
  const t = await getTranslations('experiments');
  return { title: t('title') };
}

export default async function ExperimentsListPage() {
  const t = await getTranslations('experiments');
  const locale = await getLocale();
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <Button asChild>
          <Link href={`/${locale}/dashboard/experiments/new`}>
            <IconPlus className='size-4' />
            {t('addNew')}
          </Link>
        </Button>
      }
    >
      <ExperimentsTable />
    </PageContainer>
  );
}
