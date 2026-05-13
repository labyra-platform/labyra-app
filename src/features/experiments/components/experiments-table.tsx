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
import { useExperiments } from '@/lib/firestore/queries/experiments';

const statusColor: Record<string, string> = {
  planned: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  running: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 animate-pulse',
  completed: 'bg-green-500/10 text-green-700 dark:text-green-400',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400',
  cancelled: 'bg-muted text-muted-foreground'
};

function formatDate(ms: number | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString();
}

export function ExperimentsTable() {
  const { experiments, loading } = useExperiments();
  const locale = useLocale();
  const t = useTranslations('experiments');
  const tType = useTranslations('experiments.type');
  const tStatus = useTranslations('experiments.status');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  if (experiments.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  // Use .has() check to avoid triggering MISSING_MESSAGE error events.
  // Legacy experiments may have free-form type values not in i18n catalog.
  const safeType = (key: string): string => (tType.has(key) ? tType(key) : key);
  const safeStatus = (key: string): string => (tStatus.has(key) ? tStatus(key) : key);

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colCode')}</TableHead>
            <TableHead>{t('colTitle')}</TableHead>
            <TableHead>{t('colType')}</TableHead>
            <TableHead>{t('colStatus')}</TableHead>
            <TableHead>{t('colStarted')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {experiments.map((e) => {
            // Backward-compat: handle legacy schema
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = e as any;
            const code = data.experimentCode ?? e.id;
            const type = data.experimentType ?? data.type ?? 'other';
            const startMs = e.startedAt ?? data.startDate ?? undefined;
            return (
              <TableRow key={e.id}>
                <TableCell className='font-mono text-xs'>
                  <Link
                    href={`/${locale}/dashboard/experiments/${e.id}`}
                    className='hover:underline'
                  >
                    {code}
                  </Link>
                </TableCell>
                <TableCell className='font-medium'>{e.title}</TableCell>
                <TableCell>{safeType(type)}</TableCell>
                <TableCell>
                  <Badge className={statusColor[e.status] ?? 'bg-muted'} variant='secondary'>
                    {safeStatus(e.status)}
                  </Badge>
                </TableCell>
                <TableCell className='text-muted-foreground'>
                  {formatDate(typeof startMs === 'number' ? startMs : undefined)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
