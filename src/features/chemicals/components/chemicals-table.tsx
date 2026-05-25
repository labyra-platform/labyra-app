/**
 * ChemicalsTable — DataTable migration (R210). Sortable + export + kebab actions.
 */
'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { GhsPictogramRow } from '@/components/chemicals/ghs-pictogram';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui-extra/data-table';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useChemicalsList } from '@/lib/firestore/queries/chemicals';
import type { Chemical } from '@/types/chemical';
import { ChemicalsRowActions } from './chemicals-row-actions';

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

  const href = (id: string) => `/${locale}/dashboard/chemicals/${id}`;

  const columns: DataTableColumn<Chemical>[] = [
    {
      key: 'code',
      header: t('table.code'),
      cell: (c) => (
        <Link href={href(c.id)} className='font-mono text-xs hover:underline'>
          {c.chemicalCode || '—'}
        </Link>
      ),
      sortValue: (c) => c.chemicalCode
    },
    {
      key: 'name',
      header: t('table.name'),
      cell: (c) => (
        <span className='font-medium'>
          <Link href={href(c.id)} className='hover:underline'>
            {c.name}
          </Link>
          {c.formula && (
            <span className='text-muted-foreground ml-2 font-mono text-xs'>{c.formula}</span>
          )}
        </span>
      ),
      sortValue: (c) => c.name
    },
    {
      key: 'cas',
      header: t('table.cas'),
      cell: (c) => (
        <span className='text-muted-foreground font-mono text-xs'>{c.casNumber ?? '—'}</span>
      ),
      sortValue: (c) => c.casNumber ?? ''
    },
    {
      key: 'hazards',
      header: t('table.hazards'),
      cell: (c) => <GhsPictogramRow codes={c.ghsHazards} />
    },
    {
      key: 'quantity',
      header: t('table.quantity'),
      cell: (c) => (
        <span className='tabular-nums'>
          {c.quantity} {c.unit}
        </span>
      ),
      sortValue: (c) => c.quantity ?? 0
    },
    {
      key: 'status',
      header: t('table.status'),
      cell: (c) => (
        <Badge variant='secondary' className={statusColor[c.status] ?? ''}>
          {safe((k) => tStatus(k), c.status)}
        </Badge>
      ),
      sortValue: (c) => c.status
    }
  ];

  const bulkDelete = async (ids: string[]) => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/chemicals/${id}`, {
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
              fetch(`/api/chemicals/${id}/reactivate`, {
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
    <DataTable<Chemical>
      rows={chemicals}
      columns={columns}
      rowKey={(c) => c.id}
      defaultSort={{ key: 'code', direction: 'asc' }}
      exportFilename='chemicals'
      exportValue={(c, key) => {
        if (key === 'code') return c.chemicalCode;
        if (key === 'name') return c.name;
        if (key === 'cas') return c.casNumber ?? '';
        if (key === 'hazards') return (c.ghsHazards ?? []).join(', ');
        if (key === 'quantity') return `${c.quantity} ${c.unit}`;
        if (key === 'status') return safe((k) => tStatus(k), c.status);
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
      rowActions={(c) => <ChemicalsRowActions id={c.id} name={c.name} />}
    />
  );
}
