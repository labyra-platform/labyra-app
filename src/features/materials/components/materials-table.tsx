/**
 * MaterialsTable — scientific reference catalog list (R232).
 *
 * @phase R161-data-table-migrate / R232-catalog-refocus
 */
'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn } from '@/components/ui-extra/data-table';
import { SciText } from '@/features/spectra/utils/format-units';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useMaterials } from '@/lib/firestore/queries/materials';
import type { Material } from '@/types/materials';
import { MaterialsRowActions } from './materials-row-actions';

export function MaterialsTable() {
  const { materials, loading } = useMaterials();
  const locale = useLocale();
  const t = useTranslations('materials');
  const tCat = useTranslations('materials.category');

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }
  if (materials.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>;
  }

  const columns: DataTableColumn<Material>[] = [
    {
      key: 'name',
      header: t('colName'),
      cell: (m) => (
        <Link
          href={`/${locale}/dashboard/materials/${m.id}`}
          className='font-medium hover:underline'
        >
          <SciText>{m.name}</SciText>
        </Link>
      ),
      sortValue: (m) => m.name
    },
    {
      key: 'formula',
      header: t('colFormula'),
      cell: (m) =>
        m.formula ? (
          <span className='text-muted-foreground'>
            <SciText>{m.formula}</SciText>
          </span>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
      sortValue: (m) => m.formula ?? ''
    },
    {
      key: 'category',
      header: t('colCategory'),
      cell: (m) => tCat(m.category),
      sortValue: (m) => tCat(m.category)
    },
    {
      key: 'description',
      header: t('colDescription'),
      cell: (m) => (
        <span className='text-muted-foreground line-clamp-1 max-w-md'>{m.description ?? '—'}</span>
      ),
      sortValue: (m) => m.description ?? ''
    }
  ];

  const bulkDelete = async (ids: string[]) => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/materials/${id}?reason=bulk_delete`, {
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
              fetch(`/api/materials/${id}/reactivate`, {
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
    <DataTable<Material>
      rows={materials}
      columns={columns}
      rowKey={(m) => m.id}
      defaultSort={{ key: 'name', direction: 'asc' }}
      exportFilename='materials'
      exportValue={(m, key) => {
        if (key === 'name') return m.name;
        if (key === 'formula') return m.formula ?? '';
        if (key === 'category') return tCat(m.category);
        if (key === 'description') return m.description ?? '';
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
      rowActions={(m) => <MaterialsRowActions id={m.id} name={m.name} />}
    />
  );
}
