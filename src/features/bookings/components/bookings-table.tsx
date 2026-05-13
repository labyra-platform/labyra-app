'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useBookings } from '@/lib/firestore/queries/bookings';
import type { BookingStatus } from '@/types/bookings';

const statusColor: Record<BookingStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  approved: 'bg-green-500/10 text-green-700 dark:text-green-400',
  in_progress: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 animate-pulse',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function BookingsTable() {
  const { bookings, loading } = useBookings();
  const locale = useLocale();
  const t = useTranslations('bookings');
  const tStatus = useTranslations('bookings.status');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  if (bookings.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colEquipment')}</TableHead>
            <TableHead>{t('colStart')}</TableHead>
            <TableHead>{t('colEnd')}</TableHead>
            <TableHead>{t('colPurpose')}</TableHead>
            <TableHead>{t('colStatus')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow key={b.id}>
              <TableCell>
                <Link
                  href={`/${locale}/dashboard/bookings/${b.id}`}
                  className='font-medium hover:underline'
                >
                  {b.equipmentName ?? b.equipmentId}
                </Link>
              </TableCell>
              <TableCell className='text-muted-foreground'>{formatDateTime(b.startAt)}</TableCell>
              <TableCell className='text-muted-foreground'>{formatDateTime(b.endAt)}</TableCell>
              <TableCell>{b.purpose}</TableCell>
              <TableCell>
                <Badge className={statusColor[b.status]} variant='secondary'>
                  {tStatus(b.status)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
