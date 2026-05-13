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
import { useSamples } from '@/lib/firestore/queries/samples';
import type { SampleStatus } from '@/types/samples';

const statusColor: Record<SampleStatus, string> = {
  prepared: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  in_use: 'bg-green-500/10 text-green-700 dark:text-green-400',
  consumed: 'bg-muted text-muted-foreground',
  archived: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  discarded: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

export function SamplesTable() {
  const { samples, loading } = useSamples();
  const locale = useLocale();
  const t = useTranslations('samples');
  const tStatus = useTranslations('samples.status');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  if (samples.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colCode')}</TableHead>
            <TableHead>{t('colName')}</TableHead>
            <TableHead className='text-right'>{t('colMassVolume')}</TableHead>
            <TableHead>{t('colStatus')}</TableHead>
            <TableHead>{t('colLocation')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {samples.map((s) => (
            <TableRow key={s.id}>
              <TableCell className='font-mono text-xs'>
                <Link href={`/${locale}/dashboard/samples/${s.id}`} className='hover:underline'>
                  {s.sampleCode}
                </Link>
              </TableCell>
              <TableCell className='font-medium'>{s.name}</TableCell>
              <TableCell className='text-right tabular-nums'>
                {s.mass != null ? `${s.mass} g` : s.volume != null ? `${s.volume} mL` : '—'}
              </TableCell>
              <TableCell>
                <Badge className={statusColor[s.status]} variant='secondary'>
                  {tStatus(s.status)}
                </Badge>
              </TableCell>
              <TableCell className='text-muted-foreground'>{s.location ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
