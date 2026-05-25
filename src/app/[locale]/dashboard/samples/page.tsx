import { IconPlus } from '@tabler/icons-react';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { SampleFormSheet } from '@/features/samples/components/sample-form-sheet';
import { SamplesTable } from '@/features/samples/components/samples-table';

export async function generateMetadata() {
  const t = await getTranslations('samples');
  return { title: t('title') };
}

export default async function SamplesListPage() {
  const t = await getTranslations('samples');
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <SampleFormSheet
          trigger={
            <Button>
              <IconPlus className='size-4' />
              {t('addNew')}
            </Button>
          }
        />
      }
    >
      <SamplesTable />
    </PageContainer>
  );
}
