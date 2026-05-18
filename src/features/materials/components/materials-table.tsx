/**
 * MaterialsTable — list materials with sortable columns + Excel export.
 *
 * @phase R161-data-table-migrate
 */
'use client';

import { IconAlertTriangle } from '@tabler/icons-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui-extra/data-table';
import { SciText } from '@/features/spectra/utils/format-units';
import { useMaterials } from '@/lib/firestore/queries/materials';
import type { HazardLevel, Material } from '@/types/materials';

const hazardColor: Record<HazardLevel, string> = {
  none: 'bg-muted text-muted-foreground',
  low: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  extreme: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

export function MaterialsTable() {
  const { materials, loading } = useMaterials();
  const locale = useLocale();
  const t = useTranslations('materials');
  const tCat = useTranslations('materials.category');
  const tHaz = useTranslations('materials.hazard');

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
        <>
          <Link
            href={`/${locale}/dashboard/materials/${m.id}`}
            className='font-medium hover:underline'
          >
            <SciText>{m.name}</SciText>
          </Link>
          {m.formula && (
            <span className='ml-2 text-muted-foreground text-xs'>
              <SciText>{m.formula}</SciText>
            </span>
          )}
        </>
      ),
      sortValue: (m) => m.name
    },
    {
      key: 'category',
      header: t('colCategory'),
      cell: (m) => tCat(m.category),
      sortValue: (m) => tCat(m.category)
    },
    {
      key: 'quantity',
      header: t('colQuantity'),
      cell: (m) => (
        <span className='tabular-nums'>
          {m.quantity} {m.unit}
        </span>
      ),
      sortValue: (m) => m.quantity
    },
    {
      key: 'location',
      header: t('colLocation'),
      cell: (m) => <span className='text-muted-foreground'>{m.location ?? '—'}</span>,
      sortValue: (m) => m.location ?? ''
    },
    {
      key: 'hazardLevel',
      header: t('colHazard'),
      cell: (m) => (
        <Badge className={hazardColor[m.hazardLevel]} variant='secondary'>
          {m.hazardLevel !== 'none' && <IconAlertTriangle size={10} className='mr-1' />}
          {tHaz(m.hazardLevel)}
        </Badge>
      ),
      sortValue: (m) => {
        const order: Record<HazardLevel, number> = {
          none: 0,
          low: 1,
          medium: 2,
          high: 3,
          extreme: 4
        };
        return order[m.hazardLevel];
      }
    }
  ];

  return (
    <DataTable<Material>
      rows={materials}
      columns={columns}
      rowKey={(m) => m.id}
      defaultSort={{ key: 'name', direction: 'asc' }}
      exportFilename='materials'
      exportValue={(m, key) => {
        if (key === 'name') return m.name;
        if (key === 'category') return tCat(m.category);
        if (key === 'quantity') return `${m.quantity} ${m.unit}`;
        if (key === 'location') return m.location ?? '';
        if (key === 'hazardLevel') return tHaz(m.hazardLevel);
        return null;
      }}
    />
  );
}
