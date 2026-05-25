import { IconPlus } from '@tabler/icons-react';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { ExperimentFormSheet } from '@/features/experiments/components/experiment-form-sheet';
import { ExperimentsTable } from '@/features/experiments/components/experiments-table';

export async function generateMetadata() {
  const t = await getTranslations('experiments');
  return { title: t('title') };
}

export default async function ExperimentsListPage() {
  const t = await getTranslations('experiments');
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <ExperimentFormSheet
          trigger={
            <Button>
              <IconPlus className='size-4' />
              {t('addNew')}
            </Button>
          }
        />
      }
    >
      <ExperimentsTable />
    </PageContainer>
  );
}
