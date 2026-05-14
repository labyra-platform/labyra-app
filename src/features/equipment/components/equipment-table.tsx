'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useEquipmentList } from '@/lib/firestore/queries/equipment';

// R162-batch8-safe-hoisted: extracted from EquipmentTable to satisfy
// consistent-function-scoping rule (no closure over component state).
function safe(fn: (k: string) => string, key: string): string {
  try {
    return fn(key);
  } catch {
    return key;
  }
}

const statusColor: Record<string, string> = {
  available: 'bg-green-500/10 text-green-700 dark:text-green-400',
  in_use: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  maintenance: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  broken: 'bg-red-500/10 text-red-700 dark:text-red-400',
  retired: 'bg-muted text-muted-foreground'
};

export function EquipmentTable() {
  const { equipment, loading } = useEquipmentList();
  const locale = useLocale();
  const t = useTranslations('equipment');
  const tCat = useTranslations('equipment.category');
  const tStatus = useTranslations('equipment.status');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  if (equipment.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  // R162-batch8-safe-hoisted: see top-level safe() below

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colCode')}</TableHead>
            <TableHead>{t('colName')}</TableHead>
            <TableHead>{t('colCategory')}</TableHead>
            <TableHead>{t('colStatus')}</TableHead>
            <TableHead>{t('colLocation')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {equipment.map((e) => {
            // Backward-compat: legacy schema {name, type, status, location}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = e as any;
            const code = data.equipmentCode ?? e.id;
            const category = data.category ?? data.type ?? 'other';
            return (
              <TableRow key={e.id}>
                <TableCell className='font-mono text-xs'>
                  <Link href={`/${locale}/dashboard/equipment/${e.id}`} className='hover:underline'>
                    {code}
                  </Link>
                </TableCell>
                <TableCell className='font-medium'>{e.name}</TableCell>
                <TableCell>{safe(tCat, category)}</TableCell>
                <TableCell>
                  <Badge className={statusColor[e.status] ?? 'bg-muted'} variant='secondary'>
                    {safe(tStatus, e.status)}
                  </Badge>
                </TableCell>
                <TableCell className='text-muted-foreground'>{e.location ?? '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
