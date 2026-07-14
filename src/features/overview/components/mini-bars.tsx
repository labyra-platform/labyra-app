'use client';

/**
 * Mini distribution tiles (R493) — plain-div horizontal bars (Tufte-friendly:
 * label, count, proportional bar; no chart chrome). Replaces the pie chart.
 */
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useChemicalsByHazard, useEquipmentByType } from '@/lib/firestore/queries/dashboard';

function Bars({
  rows,
  isLoading,
  empty
}: {
  rows: { label: string; count: number }[];
  isLoading: boolean;
  empty: string;
}) {
  if (isLoading) {
    return (
      <div className='space-y-2.5'>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className='h-4 w-full' />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className='text-muted-foreground text-sm'>{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className='space-y-2'>
      {rows.slice(0, 5).map((r) => (
        <div key={r.label} className='space-y-0.5'>
          <div className='flex items-baseline justify-between gap-2 text-xs'>
            <span className='text-muted-foreground truncate capitalize'>{r.label}</span>
            <span className='font-medium tabular-nums'>{r.count}</span>
          </div>
          <div className='bg-muted h-1.5 w-full overflow-hidden rounded-full'>
            <div
              className='bg-primary h-full rounded-full'
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EquipmentMini() {
  const t = useTranslations('dashboard');
  const { data, isLoading } = useEquipmentByType();
  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>{t('mini.equipment')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Bars
          rows={(data ?? []).map((d) => ({ label: d.type, count: d.count }))}
          isLoading={isLoading}
          empty={t('mini.empty')}
        />
      </CardContent>
    </Card>
  );
}

export function ChemicalsMini() {
  const t = useTranslations('dashboard');
  const { data, isLoading } = useChemicalsByHazard();
  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>{t('mini.chemicals')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Bars
          rows={(data ?? []).map((d) => ({ label: d.hazard, count: d.count }))}
          isLoading={isLoading}
          empty={t('mini.empty')}
        />
      </CardContent>
    </Card>
  );
}
