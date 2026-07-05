/**
 * StructuresBrowser — master-detail for the structure library. A detail card sits
 * on top (interactive 3D viewer on the left, a properties panel on the right,
 * styled after the Materials-Project detail layout), with the structures table
 * below. Selecting a table row updates the card in place. @phase R386
 */
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { StructureViewer } from '@/features/crystal-structures/components/structure-viewer';
import { StructureCrystalCards } from '@/features/crystal-structures/components/structure-crystal-cards';
import { StructuresTable } from '@/features/crystal-structures/components/structures-table';
import type { StructureRow } from '@/features/crystal-structures/structure-row';
import { formatSciNode } from '@/features/spectra/utils/format-units';

export function StructuresBrowser({ rows }: { rows: StructureRow[] }) {
  const t = useTranslations('structures');
  const [selectedId, setSelectedId] = useState<string>(rows[0]?.id ?? '');
  const sel = rows.find((r) => r.id === selectedId) ?? rows[0];

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

      {/* Column 1: 3D viewer · Column 2: crystallography cards */}
      <div className='grid gap-4 xl:grid-cols-2'>
        <StructureViewer key={sel.id} structureId={sel.id} />
        <div className='space-y-2'>
          <h2 className='text-lg font-semibold'>{t('crystalStructure')}</h2>
          <StructureCrystalCards key={`cards-${sel.id}`} structureId={sel.id} columns={1} />
        </div>
      </div>

      <StructuresTable rows={rows} selectedId={selectedId} onSelectRow={setSelectedId} />
    </div>
  );
}
