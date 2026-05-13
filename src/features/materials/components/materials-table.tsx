'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { useMaterials } from '@/lib/firestore/queries/materials';
import type { HazardLevel } from '@/types/materials';

const hazardColor: Record<HazardLevel, string> = {
  none: 'bg-muted text-muted-foreground',
  low: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  extreme: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

export function MaterialsTable() {
  const { materials, loading } = useMaterials();
  const locale = useLocale();
  const t = useTranslations('materials');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  if (materials.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  return (
    <div className='rounded-lg border overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead className='bg-muted/50 text-xs uppercase'>
          <tr>
            <th className='px-3 py-2 text-left'>{t('colName')}</th>
            <th className='px-3 py-2 text-left'>{t('colCategory')}</th>
            <th className='px-3 py-2 text-right'>{t('colQuantity')}</th>
            <th className='px-3 py-2 text-left'>{t('colLocation')}</th>
            <th className='px-3 py-2 text-left'>{t('colHazard')}</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id} className='border-t hover:bg-muted/30'>
              <td className='px-3 py-2'>
                <Link
                  href={`/${locale}/dashboard/materials/${m.id}`}
                  className='font-medium hover:underline'
                >
                  {m.name}
                </Link>
                {m.formula && (
                  <span className='ml-2 text-muted-foreground text-xs'>{m.formula}</span>
                )}
              </td>
              <td className='px-3 py-2 capitalize'>{m.category}</td>
              <td className='px-3 py-2 text-right tabular-nums'>
                {m.quantity} {m.unit}
              </td>
              <td className='px-3 py-2 text-muted-foreground'>{m.location ?? '—'}</td>
              <td className='px-3 py-2'>
                <Badge className={hazardColor[m.hazardLevel]} variant='secondary'>
                  {m.hazardLevel !== 'none' && <IconAlertTriangle size={10} className='mr-1' />}
                  {m.hazardLevel}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
