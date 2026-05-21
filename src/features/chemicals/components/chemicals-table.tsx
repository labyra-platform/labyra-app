'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { GhsPictogramRow } from '@/components/chemicals/ghs-pictogram';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useChemicalsList } from '@/lib/firestore/queries/chemicals';

function safe(fn: (k: string) => string, key: string): string {
  try {
    return fn(key);
  } catch {
    return key;
  }
}

const statusColor: Record<string, string> = {
  available: 'bg-green-500/10 text-green-700 dark:text-green-400',
  low: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  empty: 'bg-muted text-muted-foreground',
  expired: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

export function ChemicalsTable() {
  const { chemicals, loading } = useChemicalsList();
  const locale = useLocale();
  const t = useTranslations('chemicals');
  const tStatus = useTranslations('chemicals.status');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }
  if (chemicals.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('table.code')}</TableHead>
            <TableHead>{t('table.name')}</TableHead>
            <TableHead>{t('table.cas')}</TableHead>
            <TableHead>{t('table.hazards')}</TableHead>
            <TableHead className='text-right'>{t('table.quantity')}</TableHead>
            <TableHead>{t('table.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {chemicals.map((c) => (
            <TableRow key={c.id} className='cursor-pointer'>
              <TableCell className='font-mono text-xs'>
                <Link href={`/${locale}/dashboard/chemicals/${c.id}`} className='hover:underline'>
                  {c.chemicalCode}
                </Link>
              </TableCell>
              <TableCell className='font-medium'>
                <Link href={`/${locale}/dashboard/chemicals/${c.id}`} className='hover:underline'>
                  {c.name}
                </Link>
                {c.formula && (
                  <span className='text-muted-foreground ml-2 font-mono text-xs'>{c.formula}</span>
                )}
              </TableCell>
              <TableCell className='text-muted-foreground font-mono text-xs'>
                {c.casNumber ?? '—'}
              </TableCell>
              <TableCell>
                <GhsPictogramRow codes={c.ghsHazards} />
              </TableCell>
              <TableCell className='text-right tabular-nums'>
                {c.quantity} {c.unit}
              </TableCell>
              <TableCell>
                <Badge variant='secondary' className={statusColor[c.status] ?? ''}>
                  {safe((k) => tStatus(k), c.status)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
