import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { BookingForm } from '@/features/bookings/components/booking-form';

export async function generateMetadata() {
  const t = await getTranslations('bookings');
  return { title: t('newPageTitle') };
}

export default async function NewBookingPage() {
  const t = await getTranslations('bookings');
  return (
    <PageContainer pageTitle={t('newPageTitle')}>
      <BookingForm />
    </PageContainer>
  );
}
