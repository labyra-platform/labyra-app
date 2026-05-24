/**
 * SpectraTableAll — sortable + Excel export via shared DataTable.
 *
 * R202: migrated from raw shadcn Table to DataTable (ui-extra) for consistency
 * with experiments/samples/materials tables. Empty cells render as '—' (UX #6).
 */
'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui-extra/data-table';
import { useAllSpectra } from '@/lib/firestore/queries/spectra';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { toast } from 'sonner';
import { SpectraRowActions } from './spectra-row-actions';
import type { SpectrumStatus } from '@/types/spectra';

const statusColor: Record<SpectrumStatus, string> = {
  uploaded: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  queued: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  processing: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 animate-pulse',
  analyzed: 'bg-green-500/10 text-green-700 dark:text-green-400',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(ms: number | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

interface SpectrumRow {
  id: string;
  originalFilename: string;
  spectrumType: string;
  group: string;
  sizeBytes: number;
  status: SpectrumStatus;
  measuredAt: number | undefined;
}

export function SpectraTableAll() {
  const { spectra, loading } = useAllSpectra();
  const locale = useLocale();
  const t = useTranslations('spectra');
  const tType = useTranslations('spectra.type');
  const tStatus = useTranslations('spectra.status');
  const tGroup = useTranslations('spectra.group');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }
  if (spectra.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  const safeType = (k: string): string => (tType.has(k) ? tType(k) : k);
  const safeGroup = (k: string): string => (tGroup.has(k) ? tGroup(k) : k);
  const safeStatus = (k: string): string => (tStatus.has(k) ? tStatus(k) : k);

  const rows: SpectrumRow[] = spectra.map((s) => ({
    id: s.id,
    originalFilename: s.originalFilename,
    spectrumType: s.spectrumType,
    group: s.group,
    sizeBytes: s.sizeBytes,
    status: s.status,
    measuredAt: s.measuredAt
  }));

  const columns: DataTableColumn<SpectrumRow>[] = [
    {
      key: 'filename',
      header: t('colFilename'),
      cell: (r) => (
        <Link href={`/${locale}/dashboard/spectra/${r.id}`} className='font-medium hover:underline'>
          {r.originalFilename || '—'}
        </Link>
      ),
      sortValue: (r) => r.originalFilename
    },
    {
      key: 'type',
      header: t('colType'),
      cell: (r) => safeType(r.spectrumType),
      sortValue: (r) => safeType(r.spectrumType)
    },
    {
      key: 'group',
      header: t('colGroup'),
      cell: (r) => <span className='text-muted-foreground'>{safeGroup(r.group)}</span>,
      sortValue: (r) => safeGroup(r.group)
    },
    {
      key: 'size',
      header: t('colSize'),
      cell: (r) => (
        <span className='text-muted-foreground tabular-nums'>{formatSize(r.sizeBytes)}</span>
      ),
      sortValue: (r) => r.sizeBytes ?? 0
    },
    {
      key: 'status',
      header: t('colStatus'),
      cell: (r) => (
        <Badge className={statusColor[r.status] ?? 'bg-muted'} variant='secondary'>
          {safeStatus(r.status)}
        </Badge>
      ),
      sortValue: (r) => safeStatus(r.status)
    },
    {
      key: 'measuredAt',
      header: t('colMeasuredAt'),
      cell: (r) => <span className='text-muted-foreground'>{formatDateTime(r.measuredAt)}</span>,
      sortValue: (r) => r.measuredAt ?? 0
    }
  ];

  const bulkDelete = async (ids: string[]) => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/measurements/${id}?reason=bulk_delete`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` }
        })
      )
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    toast.success(t('toastBulkDeleted', { count: ok }), {
      action: {
        label: t('undo'),
        onClick: () => {
          void Promise.allSettled(
            ids.map((id) =>
              fetch(`/api/measurements/${id}/reactivate`, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}` }
              })
            )
          );
        }
      }
    });
  };

  return (
    <DataTable<SpectrumRow>
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      defaultSort={{ key: 'measuredAt', direction: 'desc' }}
      exportFilename='measurements'
      exportValue={(r, key) => {
        if (key === 'filename') return r.originalFilename;
        if (key === 'type') return safeType(r.spectrumType);
        if (key === 'group') return safeGroup(r.group);
        if (key === 'size') return formatSize(r.sizeBytes);
        if (key === 'status') return safeStatus(r.status);
        if (key === 'measuredAt') return formatDateTime(r.measuredAt);
        return null;
      }}
      selectable
      renderBulkActions={(ids) => (
        <button
          type='button'
          onClick={() => void bulkDelete(ids)}
          className='inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10'
        >
          {t('delete')} ({ids.length})
        </button>
      )}
      rowActions={(r) => <SpectraRowActions id={r.id} name={r.originalFilename} />}
    />
  );
}
