'use client';

/**
 * Today card (R493) — the signed-in user's bookings overlapping today plus
 * the three actions that start a lab day.
 */
import { useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { useMyBookingsToday } from '@/lib/firestore/queries/dashboard';

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TodayCard() {
  const t = useTranslations('dashboard');
  const { user } = useAuth();
  const { items, isLoading } = useMyBookingsToday(user?.uid);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Icons.calendar className='size-4' aria-hidden='true' />
          {t('today.title')}
        </CardTitle>
        <p className='text-muted-foreground text-xs capitalize'>{today}</p>
      </CardHeader>
      <CardContent className='space-y-3'>
        {isLoading ? (
          <Skeleton className='h-5 w-52' />
        ) : items.length === 0 ? (
          <p className='text-muted-foreground text-sm'>{t('today.noBookings')}</p>
        ) : (
          <ul className='space-y-1.5'>
            {items.map((b) => (
              <li key={b.id} className='flex items-center gap-2 text-sm'>
                <span className='bg-primary size-1.5 shrink-0 rounded-full' aria-hidden='true' />
                <span className='text-muted-foreground shrink-0 tabular-nums'>
                  {fmtTime(b.startAt)}–{fmtTime(b.endAt)}
                </span>
                <span className='truncate font-medium'>{b.label}</span>
              </li>
            ))}
          </ul>
        )}
        <div className='flex flex-wrap gap-2 pt-1'>
          <Button asChild size='sm' variant='outline'>
            <Link href='/dashboard/computation'>
              <Icons.computation className='size-4' aria-hidden='true' />
              {t('today.newRun')}
            </Link>
          </Button>
          <Button asChild size='sm' variant='outline'>
            <Link href='/dashboard/experiments'>
              <Icons.experiments className='size-4' aria-hidden='true' />
              {t('today.logExperiment')}
            </Link>
          </Button>
          <Button asChild size='sm' variant='outline'>
            <Link href='/dashboard/bookings'>
              <Icons.calendar className='size-4' aria-hidden='true' />
              {t('today.bookEquipment')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
