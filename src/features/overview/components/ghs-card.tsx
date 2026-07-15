'use client';

/**
 * R507: GHS exposure.
 *
 * Which hazard classes the lab actually holds, and how many chemicals carry
 * each. The pictograms are the whole point — they're the symbols already on
 * every bottle, so recognition is instant and no legend is needed. Classes the
 * lab doesn't hold stay visible but greyed: knowing you have no explosives is
 * as informative as knowing you have three corrosives.
 */
import { useTranslations } from 'next-intl';
import { GhsPictogram } from '@/components/chemicals/ghs-pictogram';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
  const t = useTranslations('dashboard');
  const { buckets, totalHazardous, isLoading } = useGhsSummary();
  const countOf = new Map(buckets.map((b) => [b.code, b.count]));

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-base'>{t('ghs.title')}</CardTitle>
          {!isLoading && (
            <span className='text-muted-foreground text-xs tabular-nums'>
              {t('ghs.count', { count: totalHazardous })}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className='flex-1'>
        {isLoading ? (
          <div className='grid grid-cols-3 gap-3'>
            {ALL_GHS.map((c) => (
              <Skeleton key={c} className='h-12 w-full' />
            ))}
          </div>
        ) : (
          <div className='grid grid-cols-3 gap-2'>
            {ALL_GHS.map((code) => {
              const n = countOf.get(code) ?? 0;
              return (
                <Link
                  key={code}
                  href='/dashboard/chemicals'
                  title={`${GHS_LABELS[code]} — ${n}`}
                  className={cn(
                    'hover:bg-muted/50 flex flex-col items-center gap-0.5 rounded-md py-1.5 transition',
                    n === 0 && 'opacity-25 grayscale'
                  )}
                >
                  <GhsPictogram code={code} />
                  <span className='text-[10px] font-medium tabular-nums'>{n || ''}</span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
