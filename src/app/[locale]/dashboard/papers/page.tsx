import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { IconUpload } from '@tabler/icons-react';
import PageContainer from '@/components/layout/page-container';
import { PaperList } from '@/features/papers/components/paper-list';

export async function generateMetadata() {
  const t = await getTranslations('papers');
  return { title: t('listPageTitle') };
}

export default async function PapersListPage() {
  const t = await getTranslations('papers');
  const locale = await getLocale();
  return (
    <PageContainer>
      <div className='w-full space-y-6 px-4 md:px-6 lg:px-8'>
        <header className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>{t('listPageTitle')}</h1>
            <p className='text-muted-foreground text-sm mt-1'>{t('listPageSubtitle')}</p>
          </div>
          <Link
            href={`/${locale}/dashboard/papers/upload`}
            className='inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90'
          >
            <IconUpload className='size-4' />
            {t('uploadNew')}
          </Link>
        </header>
        <PaperList />
      </div>
    </PageContainer>
  );
}
