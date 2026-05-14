/**
 * SpectraList — list spectra for an experiment, sortable + Excel export.
 *
 * @phase R161-data-table-migrate
 */
'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui-extra/data-table';
import { useSpectraByExperiment } from '@/lib/firestore/queries/spectra';
import type { SpectrumMetadata, SpectrumStatus } from '@/types/spectra';

const statusColor: Record<SpectrumStatus, string> = {
  uploaded: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  queued: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  processing: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 animate-pulse',
  analyzed: 'bg-green-500/10 text-green-700 dark:text-green-400',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

interface SpectraListProps {
  experimentId: string;
}

export function SpectraList({ experimentId }: SpectraListProps) {
  const { spectra, loading } = useSpectraByExperiment(experimentId);
  const locale = useLocale();
  const t = useTranslations('spectra');
  const tType = useTranslations('spectra.type');
  const tStatus = useTranslations('spectra.status');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }
  if (spectra.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  const columns: DataTableColumn<SpectrumMetadata>[] = [
    {
      key: 'originalFilename',
      header: t('colFilename'),
      cell: (s) => (
        <Link href={`/${locale}/dashboard/spectra/${s.id}`} className='font-medium hover:underline'>
          {s.originalFilename}
        </Link>
      ),
      sortValue: (s) => s.originalFilename
    },
    {
      key: 'spectrumType',
      header: t('colType'),
      cell: (s) => tType(s.spectrumType),
      sortValue: (s) => tType(s.spectrumType)
    },
    {
      key: 'sizeBytes',
      header: t('colSize'),
      cell: (s) => (
        <span className='text-muted-foreground tabular-nums'>{formatSize(s.sizeBytes)}</span>
      ),
      sortValue: (s) => s.sizeBytes
    },
    {
      key: 'status',
      header: t('colStatus'),
      cell: (s) => (
        <Badge className={statusColor[s.status]} variant='secondary'>
          {tStatus(s.status)}
        </Badge>
      ),
      sortValue: (s) => tStatus(s.status)
    },
    {
      key: 'measuredAt',
      header: t('colMeasuredAt'),
      cell: (s) => (
        <span className='text-muted-foreground'>{new Date(s.measuredAt).toLocaleString()}</span>
      ),
      sortValue: (s) => s.measuredAt
    }
  ];

  return (
    <DataTable<SpectrumMetadata>
      rows={spectra}
      columns={columns}
      rowKey={(s) => s.id}
      defaultSort={{ key: 'measuredAt', direction: 'desc' }}
      exportFilename={`spectra-${experimentId}`}
      exportValue={(s, key) => {
        if (key === 'originalFilename') return s.originalFilename;
        if (key === 'spectrumType') return tType(s.spectrumType);
        if (key === 'sizeBytes') return formatSize(s.sizeBytes);
        if (key === 'status') return tStatus(s.status);
        if (key === 'measuredAt') return new Date(s.measuredAt).toLocaleString();
        return null;
      }}
    />
  );
}
