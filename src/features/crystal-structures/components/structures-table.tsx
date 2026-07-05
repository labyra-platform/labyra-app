/**
 * Crystal-structures table — Materials-Explorer-style columns (Material ID,
 * Formula, Crystal System, Space Group, Sites) over the tenant's structure
 * library, with row delete. Formula links to the 3D detail view.
 *
 * @phase R318-crystal-structures
 */
'use client';

import { IconTrash } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Link, useRouter } from '@/i18n/navigation';
import { formatSciNode, formatSpaceGroup } from '@/features/spectra/utils/format-units';
import { SortableHead, useSortRows } from '@/components/ui-extra/sortable-head';
import type { StructureRow } from '../structure-row';

export function StructuresTable({
  rows,
  selectedId,
  onSelectRow
}: {
  rows: StructureRow[];
  /** When set, rows select (highlight) instead of the formula linking away. */
  selectedId?: string;
  onSelectRow?: (id: string) => void;
}) {
  const t = useTranslations('structures');
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const sortable = useSortRows(rows, {
    mpId: (r) => r.mpId ?? null,
    formula: (r) => r.formula,
    system: (r) => r.crystalSystem,
    spaceGroup: (r) => r.spaceGroup,
    sites: (r) => r.nat
  });

  async function remove(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/structures/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className='overflow-hidden rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead
              label={t('colMaterialId')}
              sortKey='mpId'
              activeKey={sortable.sortKey}
              dir={sortable.dir}
              onToggle={sortable.toggle}
            />
            <SortableHead
              label={t('colFormula')}
              sortKey='formula'
              activeKey={sortable.sortKey}
              dir={sortable.dir}
              onToggle={sortable.toggle}
            />
            <SortableHead
              label={t('colCrystalSystem')}
              sortKey='system'
              activeKey={sortable.sortKey}
              dir={sortable.dir}
              onToggle={sortable.toggle}
            />
            <SortableHead
              label={t('colSpaceGroup')}
              sortKey='spaceGroup'
              activeKey={sortable.sortKey}
              dir={sortable.dir}
              onToggle={sortable.toggle}
            />
            <SortableHead
              label={t('colSites')}
              sortKey='sites'
              align='right'
              activeKey={sortable.sortKey}
              dir={sortable.dir}
              onToggle={sortable.toggle}
            />
            <TableHead className='w-10' />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortable.sorted.map((r) => (
            <TableRow
              key={r.id}
              className={
                onSelectRow
                  ? `cursor-pointer ${selectedId === r.id ? 'bg-muted/60' : 'hover:bg-muted/30'}`
                  : undefined
              }
              onClick={onSelectRow ? () => onSelectRow(r.id) : undefined}
            >
              <TableCell className='text-muted-foreground font-mono text-xs'>
                {r.mpId ?? '—'}
              </TableCell>
              <TableCell>
                {onSelectRow ? (
                  <span className='text-primary font-medium'>{formatSciNode(r.formula)}</span>
                ) : (
                  <Link
                    href={`/dashboard/structures/${r.id}`}
                    className='text-primary font-medium underline-offset-2 hover:underline'
                  >
                    {formatSciNode(r.formula)}
                  </Link>
                )}
              </TableCell>
              <TableCell>{r.crystalSystem}</TableCell>
              <TableCell className='font-mono text-xs'>{formatSpaceGroup(r.spaceGroup)}</TableCell>
              <TableCell className='text-right tabular-nums'>{r.nat}</TableCell>
              <TableCell>
                <Button
                  variant='ghost'
                  size='icon'
                  disabled={busy === r.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(r.id);
                  }}
                  aria-label={t('delete')}
                >
                  <IconTrash className='size-4' />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
