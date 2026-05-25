import { IconPlus } from '@tabler/icons-react';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { ChemicalFormSheet } from '@/features/chemicals/components/chemical-form-sheet';
import { ChemicalsTable } from '@/features/chemicals/components/chemicals-table';

export async function generateMetadata() {
  const t = await getTranslations('chemicals');
  return { title: t('title') };
}

export default async function ChemicalsListPage() {
  const t = await getTranslations('chemicals');
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <ChemicalFormSheet
          trigger={
            <Button>
              <IconPlus className='size-4' />
              {t('addNew')}
            </Button>
          }
        />
      }
    >
      <ChemicalsTable />
    </PageContainer>
  );
}
