/**
 * Crystal-structures table — Mat3ra-style columns (Formula, Unit Cell, Lattice,
 * Symmetry, Atoms, Source) over the tenant's structure library, with row delete.
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
import { formatSciNode } from '@/features/spectra/utils/format-units';
import type { StructureRow } from '../structure-row';

export function StructuresTable({ rows }: { rows: StructureRow[] }) {
  const t = useTranslations('structures');
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

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
            <TableHead>{t('colFormula')}</TableHead>
            <TableHead>{t('colUnitCell')}</TableHead>
            <TableHead>{t('colLattice')}</TableHead>
            <TableHead>{t('colSymmetry')}</TableHead>
            <TableHead className='text-right'>{t('colAtoms')}</TableHead>
            <TableHead>{t('colSource')}</TableHead>
            <TableHead className='w-10' />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link
                  href={`/dashboard/structures/${r.id}`}
                  className='text-primary font-medium underline-offset-2 hover:underline'
                >
                  {formatSciNode(r.formula)}
                </Link>
                <span className='text-muted-foreground ml-2 text-xs'>{r.name}</span>
              </TableCell>
              <TableCell className='tabular-nums'>{r.unitCellFormula}</TableCell>
              <TableCell>{r.lattice}</TableCell>
              <TableCell className='font-mono text-xs'>{r.spaceGroup}</TableCell>
              <TableCell className='text-right tabular-nums'>{r.nat}</TableCell>
              <TableCell>
                <span className='text-muted-foreground text-xs uppercase'>{r.source}</span>
              </TableCell>
              <TableCell>
                <Button
                  variant='ghost'
                  size='icon'
                  disabled={busy === r.id}
                  onClick={() => remove(r.id)}
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
