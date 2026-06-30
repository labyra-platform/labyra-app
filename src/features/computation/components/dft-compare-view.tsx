/**
 * Compare view — pick runs (checkboxes), see their band gaps overlaid on one
 * chart and laid out in a table with Hubbard U per manifold. Built for DFT+U
 * calibration: launch a U sweep via the clone dialog, then read gap-vs-U here.
 *
 * @phase R307-compare-runs
 */
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { CompareRow } from '@/features/computation/compare-rows';
import { allManifolds, uOf } from '@/features/computation/compare-rows';
import { Link } from '@/i18n/navigation';
import { CompareGapChart } from './compare-gap-chart';

function fmt(n: number | null, d = 2): string {
  return n != null ? n.toFixed(d) : '—';
}

export function DftCompareView({ rows }: { rows: CompareRow[] }) {
  const t = useTranslations('computation');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.gapEv != null).map((r) => r.id))
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const manifolds = allManifolds(selectedRows);

  if (rows.length === 0) {
    return (
      <div className='text-muted-foreground py-12 text-center text-sm'>{t('noWorkflows')}</div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-x-4 gap-y-2 rounded-lg border p-3'>
        {rows.map((r) => (
          <label key={r.id} className='flex cursor-pointer items-center gap-2 text-sm'>
            <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
            <span>{r.name}</span>
          </label>
        ))}
      </div>

      {selectedRows.length > 0 ? (
        <>
          <div className='h-72 rounded-lg border p-3'>
            <CompareGapChart rows={selectedRows} />
          </div>
          <div className='overflow-hidden rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.colJob')}</TableHead>
                  {manifolds.map((m) => (
                    <TableHead key={m}>U({m})</TableHead>
                  ))}
                  <TableHead>{t('bandGapLabel')}</TableHead>
                  <TableHead>{t('totalEnergy')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/computation/${r.id}`}
                        className='font-medium hover:underline'
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    {manifolds.map((m) => (
                      <TableCell key={m} className='tabular-nums'>
                        {fmt(uOf(r, m), 2)}
                      </TableCell>
                    ))}
                    <TableCell className='tabular-nums'>
                      {r.gapEv != null ? `${r.gapEv.toFixed(2)} eV` : '—'}
                      {r.direct != null ? (
                        <span className='text-muted-foreground'>
                          {' '}
                          {r.direct ? t('direct') : t('indirect')}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {r.energyRy != null ? `${r.energyRy.toFixed(2)} Ry` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <p className='text-muted-foreground py-12 text-center text-sm'>{t('compareSelectHint')}</p>
      )}
    </div>
  );
}
