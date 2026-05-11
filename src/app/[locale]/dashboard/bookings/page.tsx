import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';

export default async function BookingsPage() {
  const t = await getTranslations('nav');

  return (
    <PageContainer pageTitle={t('bookings')} pageDescription='Coming soon'>
      <div className='text-muted-foreground py-12 text-center text-sm'>
        This page is part of Phase 4 / Phase 5 of the R160 roadmap.
      </div>
    </PageContainer>
  );
}
