import { getTranslations, getLocale } from 'next-intl/server';
import Link from 'next/link';
import { IconPlus } from '@tabler/icons-react';
import PageContainer from '@/components/layout/page-container';
import { SamplesTable } from '@/features/samples/components/samples-table';

export async function generateMetadata() {
  const t = await getTranslations('samples');
  return { title: t('title') };
}

export default async function SamplessListPage() {
  const t = await getTranslations('samples');
  const locale = await getLocale();
  return (
    <PageContainer>
      <div className='w-full space-y-6 px-4 md:px-6 lg:px-8'>
        <header className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>{t('title')}</h1>
            <p className='text-muted-foreground text-sm mt-1'>{t('subtitle')}</p>
          </div>
          <Link
            href={`/${locale}/dashboard/samples/new`}
            className='inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90'
          >
            <IconPlus className='size-4' />
            {t('addNew')}
          </Link>
        </header>
        <SamplesTable />
      </div>
    </PageContainer>
  );
}
