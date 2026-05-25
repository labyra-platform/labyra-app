import { IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { BookingsView } from '@/features/bookings/components/bookings-view';

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
      <BookingsView />
    </PageContainer>
  );
}
