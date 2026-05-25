'use client';

/** Bookings view switcher (R214) — toggle between Table and Timeline. */
import { IconCalendar, IconTable } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { BookingTimeline } from './booking-timeline';
import { BookingsTable } from './bookings-table';

export function BookingsView() {
  const t = useTranslations('bookings');
  const [view, setView] = useState<'table' | 'timeline'>('table');

  return (
    <div className='space-y-4'>
      <div className='flex gap-1'>
        <Button
          variant={view === 'table' ? 'secondary' : 'ghost'}
          size='sm'
          onClick={() => setView('table')}
        >
          <IconTable className='size-4' />
          {t('viewTable')}
        </Button>
        <Button
          variant={view === 'timeline' ? 'secondary' : 'ghost'}
          size='sm'
          onClick={() => setView('timeline')}
        >
          <IconCalendar className='size-4' />
          {t('viewTimeline')}
        </Button>
      </div>
      {view === 'table' ? <BookingsTable /> : <BookingTimeline />}
    </div>
  );
}
