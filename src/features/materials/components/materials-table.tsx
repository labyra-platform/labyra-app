'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
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
  const tCat = useTranslations('materials.category');
  const tHaz = useTranslations('materials.hazard');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  if (materials.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colName')}</TableHead>
            <TableHead>{t('colCategory')}</TableHead>
            <TableHead className='text-right'>{t('colQuantity')}</TableHead>
            <TableHead>{t('colLocation')}</TableHead>
            <TableHead>{t('colHazard')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {materials.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <Link
                  href={`/${locale}/dashboard/materials/${m.id}`}
                  className='font-medium hover:underline'
                >
                  {m.name}
                </Link>
                {m.formula && (
                  <span className='ml-2 text-muted-foreground text-xs'>{m.formula}</span>
                )}
              </TableCell>
              <TableCell>{tCat(m.category)}</TableCell>
              <TableCell className='text-right tabular-nums'>
                {m.quantity} {m.unit}
              </TableCell>
              <TableCell className='text-muted-foreground'>{m.location ?? '—'}</TableCell>
              <TableCell>
                <Badge className={hazardColor[m.hazardLevel]} variant='secondary'>
                  {m.hazardLevel !== 'none' && <IconAlertTriangle size={10} className='mr-1' />}
                  {tHaz(m.hazardLevel)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
