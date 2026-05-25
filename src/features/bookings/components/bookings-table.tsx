'use client';

/**
 * BookingsTable — DataTable migration (R213). Sortable + export + kebab (Cancel).
 * Keeps the upcoming/all/cancelled filter pills (booking-specific).
 */
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui-extra/data-table';
import { useIsAdmin } from '@/lib/auth/use-claims';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useBookings } from '@/lib/firestore/queries/bookings';
import type { Booking, BookingStatus } from '@/types/bookings';
import { BookingsRowActions } from './bookings-row-actions';

const statusColor: Record<BookingStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  approved: 'bg-green-500/10 text-green-700 dark:text-green-400',
  in_progress: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

type FilterMode = 'upcoming' | 'all' | 'cancelled';
const FILTERS: FilterMode[] = ['upcoming', 'all', 'cancelled'];

export function BookingsTable() {
  const { bookings, loading } = useBookings();
  const locale = useLocale();
  const t = useTranslations('bookings');
  const tStatus = useTranslations('bookings.status');
  const isAdmin = useIsAdmin();
  const [filter, setFilter] = useState<FilterMode>('upcoming');
  const currentUid = getFirebaseAuth().currentUser?.uid;

  const filtered = useMemo(() => {
    const now = Date.now();
    return bookings.filter((b) => {
      if (filter === 'cancelled') return b.status === 'cancelled';
      if (filter === 'upcoming') return b.status !== 'cancelled' && b.endAt >= now;
      return true;
    });
  }, [bookings, filter]);

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  const columns: DataTableColumn<Booking>[] = [
    {
      key: 'equipment',
      header: t('colEquipment'),
      cell: (b) => (
        <span>
          <Link
            href={`/${locale}/dashboard/bookings/${b.id}`}
            className='font-medium hover:underline'
          >
            {b.equipmentName ?? b.equipmentId}
          </Link>
          {b.userId === currentUid && (
            <span className='text-muted-foreground ml-2 text-xs'>{t('byYou')}</span>
          )}
        </span>
      ),
      sortValue: (b) => b.equipmentName ?? b.equipmentId
    },
    {
      key: 'start',
      header: t('colStart'),
      cell: (b) => <span className='text-muted-foreground'>{formatDateTime(b.startAt)}</span>,
      sortValue: (b) => b.startAt
    },
    {
      key: 'end',
      header: t('colEnd'),
      cell: (b) => <span className='text-muted-foreground'>{formatDateTime(b.endAt)}</span>,
      sortValue: (b) => b.endAt
    },
    {
      key: 'purpose',
      header: t('colPurpose'),
      cell: (b) => b.purpose,
      sortValue: (b) => b.purpose
    },
    {
      key: 'status',
      header: t('colStatus'),
      cell: (b) => (
        <Badge className={statusColor[b.status]} variant='secondary'>
          {tStatus(b.status)}
        </Badge>
      ),
      sortValue: (b) => b.status
    }
  ];

  return (
    <div className='space-y-4'>
      <div className='flex gap-1'>
        {FILTERS.map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'secondary' : 'ghost'}
            size='sm'
            onClick={() => setFilter(f)}
          >
            {t(`filter.${f}`)}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border py-12 text-center text-sm'>
          {t('empty')}
        </div>
      ) : (
        <DataTable<Booking>
          rows={filtered}
          columns={columns}
          rowKey={(b) => b.id}
          defaultSort={{ key: 'start', direction: 'asc' }}
          exportFilename='bookings'
          exportValue={(b, key) => {
            if (key === 'equipment') return b.equipmentName ?? b.equipmentId;
            if (key === 'start') return formatDateTime(b.startAt);
            if (key === 'end') return formatDateTime(b.endAt);
            if (key === 'purpose') return b.purpose;
            if (key === 'status') return tStatus(b.status);
            return null;
          }}
          rowActions={(b) => (
            <BookingsRowActions
              id={b.id}
              canCancel={
                (isAdmin || b.userId === currentUid) &&
                b.status !== 'cancelled' &&
                b.status !== 'completed'
              }
            />
          )}
        />
      )}
    </div>
  );
}
