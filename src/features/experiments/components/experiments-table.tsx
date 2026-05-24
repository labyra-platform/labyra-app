/**
 * ExperimentsTable — sortable + Excel export via DataTable.
 *
 * @phase R161-data-table-migrate
 */
'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui-extra/data-table';
import { useExperiments } from '@/lib/firestore/queries/experiments';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { toast } from 'sonner';
import { ExperimentsRowActions } from './experiments-row-actions';

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

// Flatten experiment for table render + sort + export (handles legacy schema)
interface ExperimentRow {
  id: string;
  code: string;
  title: string;
  type: string;
  workflowStatus: string;
  startedAt: number | undefined;
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

  const safeType = (key: string): string => (tType.has(key) ? tType(key) : key);
  const safeStatus = (key: string): string => (tStatus.has(key) ? tStatus(key) : key);

  // Flatten backward-compat fields once
  const rows: ExperimentRow[] = experiments.map((e) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = e as any;
    return {
      id: e.id,
      code: data.experimentCode ?? e.id,
      title: e.title,
      type: data.experimentType ?? data.type ?? 'other',
      workflowStatus: e.workflowStatus,
      startedAt: e.startedAt ?? data.startDate ?? undefined
    };
  });

  const columns: DataTableColumn<ExperimentRow>[] = [
    {
      key: 'code',
      header: t('colCode'),
      cell: (r) => (
        <Link
          href={`/${locale}/dashboard/experiments/${r.id}`}
          className='font-mono text-xs hover:underline'
        >
          {r.code}
        </Link>
      ),
      sortValue: (r) => r.code
    },
    {
      key: 'title',
      header: t('colTitle'),
      cell: (r) => <span className='font-medium'>{r.title}</span>,
      sortValue: (r) => r.title
    },
    {
      key: 'type',
      header: t('colType'),
      cell: (r) => safeType(r.type),
      sortValue: (r) => safeType(r.type)
    },
    {
      key: 'status',
      header: t('colStatus'),
      cell: (r) => (
        <Badge className={statusColor[r.workflowStatus] ?? 'bg-muted'} variant='secondary'>
          {safeStatus(r.workflowStatus)}
        </Badge>
      ),
      sortValue: (r) => safeStatus(r.workflowStatus)
    },
    {
      key: 'startedAt',
      header: t('colStarted'),
      cell: (r) => <span className='text-muted-foreground'>{formatDate(r.startedAt)}</span>,
      sortValue: (r) => r.startedAt ?? 0
    }
  ];

  const bulkDelete = async (ids: string[]) => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/experiments/${id}?reason=bulk_delete`, {
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
              fetch(`/api/experiments/${id}/reactivate`, {
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
    <DataTable<ExperimentRow>
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      defaultSort={{ key: 'startedAt', direction: 'desc' }}
      exportFilename='experiments'
      exportValue={(r, key) => {
        if (key === 'code') return r.code;
        if (key === 'title') return r.title;
        if (key === 'type') return safeType(r.type);
        if (key === 'status') return safeStatus(r.workflowStatus);
        if (key === 'startedAt') return formatDate(r.startedAt);
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
      rowActions={(r) => <ExperimentsRowActions id={r.id} name={r.title} />}
    />
  );
}
