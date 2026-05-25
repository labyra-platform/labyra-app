/**
 * EquipmentTable — DataTable migration (R212). Sortable + export + kebab.
 * Hard delete (confirm dialog), no bulk (each delete needs explicit confirm).
 */
'use client';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui-extra/data-table';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useEquipmentList } from '@/lib/firestore/queries/equipment';
import type { Equipment } from '@/types/equipment';
import { EquipmentRowActions } from './equipment-row-actions';

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

// Backward-compat legacy schema {name, type, status, location}
function codeOf(e: Equipment): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = e as any;
  return (d.equipmentCode as string | undefined) ?? e.id;
}
function catOf(e: Equipment): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = e as any;
  return (d.category as string | undefined) ?? (d.type as string | undefined) ?? 'other';
}

export function EquipmentTable() {
  const { equipment, loading } = useEquipmentList();
  const locale = useLocale();
  const t = useTranslations('equipment');
  const tCat = useTranslations('equipment.category');
  const tStatus = useTranslations('equipment.status');

  const [pendingIds, setPendingIds] = useState<string[] | null>(null);

  const doBulkDelete = async (ids: string[]) => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/equipment/${id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` }
        })
      )
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    toast.success(t('toastBulkDeleted', { count: ok }));
    setPendingIds(null);
  };

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }
  if (equipment.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  const columns: DataTableColumn<Equipment>[] = [
    {
      key: 'code',
      header: t('colCode'),
      cell: (e) => (
        <Link
          href={`/${locale}/dashboard/equipment/${e.id}`}
          className='font-mono text-xs hover:underline'
        >
          {codeOf(e)}
        </Link>
      ),
      sortValue: (e) => codeOf(e)
    },
    {
      key: 'name',
      header: t('colName'),
      cell: (e) => <span className='font-medium'>{e.name}</span>,
      sortValue: (e) => e.name
    },
    {
      key: 'category',
      header: t('colCategory'),
      cell: (e) => safe(tCat, catOf(e)),
      sortValue: (e) => safe(tCat, catOf(e))
    },
    {
      key: 'status',
      header: t('colStatus'),
      cell: (e) => (
        <Badge className={statusColor[e.status] ?? 'bg-muted'} variant='secondary'>
          {safe(tStatus, e.status)}
        </Badge>
      ),
      sortValue: (e) => safe(tStatus, e.status)
    },
    {
      key: 'location',
      header: t('colLocation'),
      cell: (e) => <span className='text-muted-foreground'>{e.location ?? '—'}</span>,
      sortValue: (e) => e.location ?? ''
    }
  ];

  return (
    <>
      <DataTable<Equipment>
        rows={equipment}
        columns={columns}
        rowKey={(e) => e.id}
        defaultSort={{ key: 'code', direction: 'asc' }}
        exportFilename='equipment'
        exportValue={(e, key) => {
          if (key === 'code') return codeOf(e);
          if (key === 'name') return e.name;
          if (key === 'category') return safe(tCat, catOf(e));
          if (key === 'status') return safe(tStatus, e.status);
          if (key === 'location') return e.location ?? '';
          return null;
        }}
        selectable
        renderBulkActions={(ids) => (
          <button
            type='button'
            onClick={() => setPendingIds(ids)}
            className='inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10'
          >
            {t('delete')} ({ids.length})
          </button>
        )}
        rowActions={(e) => <EquipmentRowActions id={e.id} name={e.name} />}
      />
      <AlertDialog open={pendingIds !== null} onOpenChange={(o) => !o && setPendingIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bulkDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('bulkDeleteConfirm', { count: pendingIds?.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={() => pendingIds && void doBulkDelete(pendingIds)}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
