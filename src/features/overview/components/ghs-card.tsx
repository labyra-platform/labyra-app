'use client';

/**
 * GHS exposure (R507, rebuilt on Panel R510).
 *
 * The pictograms are the point: they're the symbols already printed on every
 * bottle, so recognition needs no legend. Classes the lab doesn't hold stay
 * visible but greyed — knowing you have no explosives is as informative as
 * knowing you have three corrosives, and a grid that changes shape with the
 * data is harder to read at a glance than one that never moves.
 */
import { useTranslations } from 'next-intl';
import { GhsPictogram } from '@/components/chemicals/ghs-pictogram';
import { Panel } from '@/components/ui-extra/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { useFeatureAllowed } from '@/hooks/use-feature-access';
import { Link } from '@/i18n/navigation';
import { useGhsSummary } from '@/lib/firestore/queries/dashboard';
import { GHS_LABELS, type GHSPictogram } from '@/types/chemical';
import { cn } from '@/lib/utils';

const ALL_GHS: GHSPictogram[] = [
  'GHS01',
  'GHS02',
  'GHS03',
  'GHS04',
  'GHS05',
  'GHS06',
  'GHS07',
  'GHS08',
  'GHS09'
];

export function GhsCard() {
  const allowed = useFeatureAllowed('chemicals');
  const t = useTranslations('dashboard');
  const { buckets, totalHazardous, isLoading } = useGhsSummary();

  if (allowed === false) return null;

  const countOf = new Map(buckets.map((b) => [b.code, b.count]));

  return (
    <Panel
      title={t('ghs.title')}
      count={isLoading ? undefined : t('ghs.count', { count: totalHazardous })}
    >
      {isLoading ? (
        <Skeleton className='h-[var(--panel-viewport)] w-full' />
      ) : (
        <div className='grid h-[var(--panel-viewport)] grid-cols-3 place-content-center gap-2'>
          {ALL_GHS.map((code) => {
            const n = countOf.get(code) ?? 0;
            return (
              <Link
                key={code}
                href='/dashboard/chemicals'
                title={`${GHS_LABELS[code]} — ${n}`}
                className={cn(
                  'hover:bg-muted/50 flex flex-col items-center gap-2 rounded-lg py-2.5 transition',
                  n === 0 && 'opacity-25 grayscale'
                )}
              >
                <GhsPictogram code={code} />
                <span className='text-meta font-medium tabular-nums'>{n || ''}</span>
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
