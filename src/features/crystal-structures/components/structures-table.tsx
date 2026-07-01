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
            <TableHead>{t('colMaterialId')}</TableHead>
            <TableHead>{t('colFormula')}</TableHead>
            <TableHead>{t('colCrystalSystem')}</TableHead>
            <TableHead>{t('colSpaceGroup')}</TableHead>
            <TableHead className='text-right'>{t('colSites')}</TableHead>
            <TableHead className='w-10' />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className='text-muted-foreground font-mono text-xs'>
                {r.mpId ?? '—'}
              </TableCell>
              <TableCell>
                <Link
                  href={`/dashboard/structures/${r.id}`}
                  className='text-primary font-medium underline-offset-2 hover:underline'
                >
                  {formatSciNode(r.formula)}
                </Link>
              </TableCell>
              <TableCell>{r.crystalSystem}</TableCell>
              <TableCell className='font-mono text-xs'>{formatSpaceGroup(r.spaceGroup)}</TableCell>
              <TableCell className='text-right tabular-nums'>{r.nat}</TableCell>
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
