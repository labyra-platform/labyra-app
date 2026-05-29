import { IconUpload } from '@tabler/icons-react';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { PaperList } from '@/features/papers/components/paper-list';
import { UploadSheet } from '@/features/papers/components/upload-sheet';

export async function generateMetadata() {
  const t = await getTranslations('papers');
  return { title: t('title') };
}

export default async function PapersListPage() {
  const t = await getTranslations('papers');
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <UploadSheet
          trigger={
            <Button>
              <IconUpload className='size-4' />
              {t('uploadNew')}
            </Button>
          }
        />
      }
    >
      <PaperList />
    </PageContainer>
  );
}
