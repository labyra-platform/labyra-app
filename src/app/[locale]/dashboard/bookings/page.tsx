import { IconPlus } from '@tabler/icons-react';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { BookingFormSheet } from '@/features/bookings/components/booking-form-sheet';
import { BookingsView } from '@/features/bookings/components/bookings-view';

export async function generateMetadata() {
  const t = await getTranslations('bookings');
  return { title: t('title') };
}

export default async function BookingsListPage() {
  const t = await getTranslations('bookings');
  return (
    <PageContainer
      pageTitle={t('title')}
      pageDescription={t('subtitle')}
      pageHeaderAction={
        <BookingFormSheet
          trigger={
            <Button>
              <IconPlus className='size-4' />
              {t('addNew')}
            </Button>
          }
        />
      }
    >
      <BookingsView />
    </PageContainer>
  );
}
