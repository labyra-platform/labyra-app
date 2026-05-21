'use client';

import { IconX } from '@tabler/icons-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useIsAdmin } from '@/lib/auth/use-claims';
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

type FilterMode = 'upcoming' | 'all' | 'cancelled';

export function BookingsTable() {
  const { bookings, loading } = useBookings();
  const locale = useLocale();
  const t = useTranslations('bookings');
  const tStatus = useTranslations('bookings.status');
  const isAdmin = useIsAdmin();
  const [filter, setFilter] = useState<FilterMode>('upcoming');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const currentUid = getFirebaseAuth().currentUser?.uid;

  const filtered = useMemo(() => {
    const now = Date.now();
    return bookings.filter((b) => {
      if (filter === 'cancelled') return b.status === 'cancelled';
      if (filter === 'upcoming') return b.status !== 'cancelled' && b.endAt >= now;
      return true; // all
    });
  }, [bookings, filter]);

  async function handleCancel(id: string) {
    if (!confirm(t('confirmCancel'))) return;
    setCancelling(id);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      toast.success(t('cancelled'));
    } catch {
      toast.error(t('cancelFailed'));
    } finally {
      setCancelling(null);
    }
  }

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  const FILTERS: FilterMode[] = ['upcoming', 'all', 'cancelled'];

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
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>
      ) : (
        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('colEquipment')}</TableHead>
                <TableHead>{t('colStart')}</TableHead>
                <TableHead>{t('colEnd')}</TableHead>
                <TableHead>{t('colPurpose')}</TableHead>
                <TableHead>{t('colStatus')}</TableHead>
                <TableHead className='w-10' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => {
                const isOwn = b.userId === currentUid;
                const canCancel =
                  (isAdmin || isOwn) && b.status !== 'cancelled' && b.status !== 'completed';
                return (
                  <TableRow key={b.id} className={b.status === 'cancelled' ? 'opacity-50' : ''}>
                    <TableCell>
                      <Link
                        href={`/${locale}/dashboard/bookings/${b.id}`}
                        className='font-medium hover:underline'
                      >
                        {b.equipmentName ?? b.equipmentId}
                      </Link>
                      {isOwn && (
                        <span className='text-muted-foreground ml-2 text-xs'>{t('byYou')}</span>
                      )}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatDateTime(b.startAt)}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatDateTime(b.endAt)}
                    </TableCell>
                    <TableCell>{b.purpose}</TableCell>
                    <TableCell>
                      <Badge className={statusColor[b.status]} variant='secondary'>
                        {tStatus(b.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canCancel && (
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-7'
                          title={t('cancel')}
                          onClick={() => void handleCancel(b.id)}
                          disabled={cancelling === b.id}
                        >
                          <IconX className='size-4' />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
