'use client';

/**
 * R506: greeting header. The three buttons are the only things a researcher
 * comes here to *start* — everything else on this page is something to read.
 */
import { useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/use-auth';

function greetingKey(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function DashboardHeader({ locale }: { locale: string }) {
  const t = useTranslations('dashboard');
  const { user } = useAuth();
  const now = new Date();
  const firstName = (user?.displayName ?? '').trim().split(/\s+/).at(-1) ?? '';

  return (
    <div className='flex flex-wrap items-start justify-between gap-3'>
      <div className='min-w-0'>
        <h1 className='truncate text-xl font-bold tracking-tight'>
          {firstName
            ? t(`greeting.${greetingKey(now.getHours())}Named`, { name: firstName })
            : t(`greeting.${greetingKey(now.getHours())}`)}
        </h1>
        <p className='text-muted-foreground mt-0.5 text-xs capitalize'>
          {now.toLocaleDateString(locale, {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })}
        </p>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button asChild size='sm' variant='outline'>
          <Link href='/dashboard/experiments'>
            <Icons.experiments className='size-4' aria-hidden />
            {t('today.logExperiment')}
          </Link>
        </Button>
        <Button asChild size='sm' variant='outline'>
          <Link href='/dashboard/computation'>
            <Icons.computation className='size-4' aria-hidden />
            {t('dft.newRun')}
          </Link>
        </Button>
        <Button asChild size='sm' variant='outline'>
          <Link href='/dashboard/bookings'>
            <Icons.calendar className='size-4' aria-hidden />
            {t('today.bookEquipment')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
