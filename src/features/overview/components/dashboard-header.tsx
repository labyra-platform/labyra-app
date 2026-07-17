'use client';

/**
 * R506: greeting header. The three buttons are the only things a researcher
 * comes here to *start* — everything else on this page is something to read.
 */
import { useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { useFeatureAllowed } from '@/hooks/use-feature-access';
import { useAuth } from '@/lib/auth/use-auth';

function greetingKey(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function DashboardHeader({ locale }: { locale: string }) {
  const t = useTranslations('dashboard');
  // Keys read from nav-config, not remembered: experiments / computation / bookings.
  const canLog = useFeatureAllowed('experiments');
  const canCompute = useFeatureAllowed('computation');
  const canBook = useFeatureAllowed('bookings');
  const { user } = useAuth();
  const now = new Date();
  const firstName = (user?.displayName ?? '').trim().split(/\s+/).at(-1) ?? '';

  return (
    // R524: items-end. The actions belong to the page, not to the greeting —
    // pinning them to the top of a two-line block left them floating against
    // the larger text. On the baseline of the date they read as one row.
    <div className='flex flex-wrap items-end justify-between gap-3'>
      <div className='min-w-0'>
        <h1 className='text-display truncate font-medium'>
          {firstName
            ? t(`greeting.${greetingKey(now.getHours())}Named`, { name: firstName })
            : t(`greeting.${greetingKey(now.getHours())}`)}
        </h1>
        <p className='text-muted-foreground text-caption mt-1 capitalize tabular-nums'>
          {now.toLocaleDateString(locale, {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })}
        </p>
      </div>
      {/* R565: the quick actions ask the same question the sidebar asks.
          R487 taught the nav to hide what you cannot reach and never told the
          dashboard. So a disabled feature vanished from the sidebar while its
          button sat here — click it and FeatureAccessGuard replaces the route
          with /dashboard/overview, silently. The user pressed a button and
          landed back where they started, which reads as the app being broken
          rather than as permission being withheld.

          `undefined` means the verdict is in flight; withhold rather than
          flash a button that is about to disappear. */}
      <div className='flex flex-wrap gap-2'>
        {canLog && (
          <Button asChild size='sm' variant='outline'>
            <Link href='/dashboard/experiments'>
              <Icons.experiments className='size-4' aria-hidden />
              {t('today.logExperiment')}
            </Link>
          </Button>
        )}
        {canCompute && (
          <Button asChild size='sm' variant='outline'>
            <Link href='/dashboard/computation'>
              <Icons.computation className='size-4' aria-hidden />
              {t('dft.newRun')}
            </Link>
          </Button>
        )}
        {canBook && (
          <Button asChild size='sm' variant='outline'>
            <Link href='/dashboard/bookings'>
              <Icons.calendar className='size-4' aria-hidden />
              {t('today.bookEquipment')}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
