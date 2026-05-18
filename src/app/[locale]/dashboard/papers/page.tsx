import { IconUpload } from '@tabler/icons-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { PaperList } from '@/features/papers/components/paper-list';

export async function generateMetadata() {
  const t = await getTranslations('papers');
  return { title: t('title') };
}

export default async function PapersListPage() {
  const t = await getTranslations('papers');
  const locale = await getLocale();
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <Button asChild>
          <Link href={`/${locale}/dashboard/papers/upload`}>
            <IconUpload className='size-4' />
            {t('uploadNew')}
          </Link>
        </Button>
      }
    >
      <PaperList />
    </PageContainer>
  );
}
