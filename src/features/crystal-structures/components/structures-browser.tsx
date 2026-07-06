/**
 * StructuresBrowser — master-detail for the structure library. A detail card sits
 * on top (interactive 3D viewer on the left, a properties panel on the right,
 * styled after the Materials-Project detail layout), with the structures table
 * below. Selecting a table row updates the card in place. @phase R386
 */
'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { StructureViewer } from '@/features/crystal-structures/components/structure-viewer';
import { StructureCrystalCards } from '@/features/crystal-structures/components/structure-crystal-cards';
import { BrillouinViewer } from '@/features/crystal-structures/components/brillouin-viewer';
import { StructureMpSummary } from '@/features/crystal-structures/components/structure-mp-summary';
import { StructuresTable } from '@/features/crystal-structures/components/structures-table';
import type { StructureRow } from '@/features/crystal-structures/structure-row';
import { formatSciNode } from '@/features/spectra/utils/format-units';

export function StructuresBrowser({ rows }: { rows: StructureRow[] }) {
  const t = useTranslations('structures');
  const [selectedId, setSelectedId] = useState<string>(rows[0]?.id ?? '');
  const [bandGaps, setBandGaps] = useState<Record<string, number | null | undefined>>({});
  const sel = rows.find((r) => r.id === selectedId) ?? rows[0];

  // Background-fetch MP band gaps for every mp-sourced row (cached on the doc
  // after the first hit) so the table's Band Gap column fills in progressively.
  useEffect(() => {
    let alive = true;
    const mpRows = rows.filter((r) => r.mpId);
    void Promise.all(
      mpRows.map(async (r) => {
        if (bandGaps[r.id] !== undefined) return;
        try {
          const res = await fetch(`/api/structures/${r.id}/mp-summary`);
          if (!res.ok) return;
          const mp = (await res.json()) as { bandGap: number | null };
          if (alive) setBandGaps((prev) => ({ ...prev, [r.id]: mp.bandGap }));
        } catch {
          /* leave undefined */
        }
      })
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  if (!sel) return null;

  return (
    <div className='space-y-4'>
      {/* Header */}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h1 className='text-xl font-semibold'>{formatSciNode(sel.formula)}</h1>
        <div className='flex items-center gap-1.5'>
          <Badge variant='outline' className='uppercase'>
            {sel.source}
          </Badge>
          {sel.verified ? <Badge variant='secondary'>{t('verified')}</Badge> : null}
          {sel.mpId ? (
            <a
              href={`https://materialsproject.org/materials/${sel.mpId}`}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary font-mono text-sm underline-offset-2 hover:underline'
            >
              {sel.mpId}
            </a>
          ) : null}
        </div>
      </div>

      {/* Column 1 (1/3): viewer + MP summary · Column 2 (2/3): crystal cards 2×2 */}
      <div className='grid gap-4 xl:grid-cols-3'>
        <div className='space-y-3'>
          <StructureViewer key={sel.id} structureId={sel.id} />
          {sel.mpId ? (
            <StructureMpSummary
              key={`mp-${sel.id}`}
              structureId={sel.id}
              onLoaded={(mp) => setBandGaps((prev) => ({ ...prev, [sel.id]: mp.bandGap }))}
            />
          ) : null}
          <BrillouinViewer key={`bz-${sel.id}`} structureId={sel.id} />
        </div>
        <div className='space-y-2 xl:col-span-2'>
          <h2 className='text-lg font-semibold'>{t('crystalStructure')}</h2>
          <StructureCrystalCards key={`cards-${sel.id}`} structureId={sel.id} columns={2} />
        </div>
      </div>

      <StructuresTable
        rows={rows}
        selectedId={selectedId}
        onSelectRow={setSelectedId}
        bandGaps={bandGaps}
      />
    </div>
  );
}
