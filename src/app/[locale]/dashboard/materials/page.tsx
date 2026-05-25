import { IconPlus } from '@tabler/icons-react';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { MaterialFormSheet } from '@/features/materials/components/material-form-sheet';
import { MaterialsCatalog } from '@/features/materials/components/materials-catalog';

export async function generateMetadata() {
  const t = await getTranslations('materials');
  return { title: t('title') };
}

export default async function MaterialsListPage() {
  const t = await getTranslations('materials');
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <MaterialFormSheet
          trigger={
            <Button>
              <IconPlus className='size-4' />
              {t('addNew')}
            </Button>
          }
        />
      }
    >
      <Suspense fallback={null}>
        <MaterialsCatalog />
      </Suspense>
    </PageContainer>
  );
}
