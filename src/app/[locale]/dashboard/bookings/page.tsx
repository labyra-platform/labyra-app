import { getTranslations, getLocale } from 'next-intl/server';
import Link from 'next/link';
import { IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/layout/page-container';
import { BookingsTable } from '@/features/bookings/components/bookings-table';

export async function generateMetadata() {
  const t = await getTranslations('bookings');
  return { title: t('title') };
}

export default async function BookingsListPage() {
  const t = await getTranslations('bookings');
  const locale = await getLocale();
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <Button asChild>
          <Link href={`/${locale}/dashboard/bookings/new`}>
            <IconPlus className='size-4' />
            {t('addNew')}
          </Link>
        </Button>
      }
    >
      <BookingsTable />
    </PageContainer>
  );
}
