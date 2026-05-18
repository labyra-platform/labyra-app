/**
 * SamplesTable — sortable + Excel export via DataTable.
 *
 * @phase R161-data-table-migrate
 */
'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui-extra/data-table';
import { SciText } from '@/features/spectra/utils/format-units';
import { useSamples } from '@/lib/firestore/queries/samples';
import type { Sample, SampleStatus } from '@/types/samples';

// R165-phase-6-samples-status: Sample.status renamed to workflowStatus in R164 Phase 1.
// Old data may still have `status` field; new data uses workflowStatus.
// Defensive fallback prevents tStatus(undefined) → MISSING_MESSAGE → DataTable crash.
function getStatus(s: Sample): SampleStatus {
  const ws = (s as Sample & { status?: SampleStatus }).workflowStatus;
  if (ws) return ws;
  const legacy = (s as Sample & { status?: SampleStatus }).status;
  return legacy ?? 'prepared';
}

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

  const columns: DataTableColumn<Sample>[] = [
    {
      key: 'sampleCode',
      header: t('colCode'),
      cell: (s) => (
        <Link
          href={`/${locale}/dashboard/samples/${s.id}`}
          className='font-mono text-xs hover:underline'
        >
          {s.sampleCode}
        </Link>
      ),
      sortValue: (s) => s.sampleCode
    },
    {
      key: 'name',
      header: t('colName'),
      cell: (s) => (
        <span className='font-medium'>
          <SciText>{s.name}</SciText>
        </span>
      ),
      sortValue: (s) => s.name
    },
    {
      key: 'massVolume',
      header: t('colMassVolume'),
      cell: (s) => (
        <span className='tabular-nums'>
          {s.mass != null ? `${s.mass} g` : s.volume != null ? `${s.volume} mL` : '—'}
        </span>
      ),
      sortValue: (s) => s.mass ?? s.volume ?? 0
    },
    {
      key: 'status',
      header: t('colStatus'),
      cell: (s) => (
        <Badge className={statusColor[getStatus(s)]} variant='secondary'>
          {tStatus(getStatus(s))}
        </Badge>
      ),
      sortValue: (s) => tStatus(getStatus(s))
    },
    {
      key: 'location',
      header: t('colLocation'),
      cell: (s) => <span className='text-muted-foreground'>{s.location ?? '—'}</span>,
      sortValue: (s) => s.location ?? ''
    }
  ];

  return (
    <DataTable<Sample>
      rows={samples}
      columns={columns}
      rowKey={(s) => s.id}
      defaultSort={{ key: 'sampleCode', direction: 'asc' }}
      exportFilename='samples'
      exportValue={(s, key) => {
        if (key === 'sampleCode') return s.sampleCode;
        if (key === 'name') return s.name;
        if (key === 'massVolume')
          return s.mass != null ? `${s.mass} g` : s.volume != null ? `${s.volume} mL` : '';
        if (key === 'status') return tStatus(getStatus(s));
        if (key === 'location') return s.location ?? '';
        return null;
      }}
    />
  );
}
