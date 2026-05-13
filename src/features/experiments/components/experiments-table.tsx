'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
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
  return new Date(ms).toLocaleDateString('vi-VN');
}

export function ExperimentsTable() {
  const { experiments, loading } = useExperiments();
  const locale = useLocale();
  const t = useTranslations('experiments');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  if (experiments.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  return (
    <div className='rounded-lg border overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead className='bg-muted/50 text-xs uppercase'>
          <tr>
            <th className='px-3 py-2 text-left'>{t('colCode')}</th>
            <th className='px-3 py-2 text-left'>{t('colTitle')}</th>
            <th className='px-3 py-2 text-left'>{t('colType')}</th>
            <th className='px-3 py-2 text-left'>{t('colStatus')}</th>
            <th className='px-3 py-2 text-left'>{t('colStarted')}</th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((e) => {
            // Backward-compat: handle data with legacy schema (type vs experimentType, no experimentCode)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = e as any;
            const code = data.experimentCode ?? e.id;
            const type = data.experimentType ?? data.type ?? '—';
            const startMs = e.startedAt ?? data.startDate ?? undefined;
            return (
              <tr key={e.id} className='border-t hover:bg-muted/30'>
                <td className='px-3 py-2 font-mono text-xs'>
                  <Link
                    href={`/${locale}/dashboard/experiments/${e.id}`}
                    className='hover:underline'
                  >
                    {code}
                  </Link>
                </td>
                <td className='px-3 py-2 font-medium'>{e.title}</td>
                <td className='px-3 py-2 capitalize'>{type}</td>
                <td className='px-3 py-2'>
                  <Badge className={statusColor[e.status] ?? 'bg-muted'} variant='secondary'>
                    {e.status}
                  </Badge>
                </td>
                <td className='px-3 py-2 text-muted-foreground'>
                  {formatDate(typeof startMs === 'number' ? startMs : undefined)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
