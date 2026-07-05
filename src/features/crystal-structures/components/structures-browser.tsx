/**
 * StructuresBrowser — master-detail for the structure library. A detail card sits
 * on top (interactive 3D viewer on the left, a properties panel on the right,
 * styled after the Materials-Project detail layout), with the structures table
 * below. Selecting a table row updates the card in place. @phase R386
 */
'use client';

import { IconRocket } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StructureViewer } from '@/features/crystal-structures/components/structure-viewer';
import { StructuresTable } from '@/features/crystal-structures/components/structures-table';
import type { StructureRow } from '@/features/crystal-structures/structure-row';
import { formatSciNode, formatSpaceGroup } from '@/features/spectra/utils/format-units';
import { Link } from '@/i18n/navigation';

/** One label/value row in the properties panel (MP-detail style). */
function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex items-start justify-between gap-4 border-b py-2 last:border-b-0'>
      <span className='text-sm font-medium'>{label}</span>
      <span className='text-primary text-right text-sm'>{children}</span>
    </div>
  );
}

export function StructuresBrowser({ rows }: { rows: StructureRow[] }) {
  const t = useTranslations('structures');
  const [selectedId, setSelectedId] = useState<string>(rows[0]?.id ?? '');
  const sel = rows.find((r) => r.id === selectedId) ?? rows[0];

  if (!sel) return null;

  return (
    <div className='space-y-4'>
      <div className='grid gap-4 xl:grid-cols-[1fr_1fr]'>
        {/* 3D viewer (fetches its own scene by id) */}
        <StructureViewer key={sel.id} structureId={sel.id} />

        {/* Properties panel — MP-detail style */}
        <div className='flex flex-col gap-4'>
          <div className='rounded-lg border p-4'>
            <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
              <h2 className='text-lg font-semibold'>{formatSciNode(sel.formula)}</h2>
              <div className='flex items-center gap-1.5'>
                <Badge variant='outline' className='uppercase'>
                  {sel.source}
                </Badge>
                {sel.verified ? <Badge variant='secondary'>{t('verified')}</Badge> : null}
              </div>
            </div>
            <div>
              <Prop label={t('propSpaceGroup')}>
                <span className='font-mono'>{formatSpaceGroup(sel.spaceGroup)}</span>
              </Prop>
              <Prop label={t('propCrystalSystem')}>{sel.crystalSystem}</Prop>
              <Prop label={t('propLattice')}>{sel.lattice}</Prop>
              <Prop label={t('propUnitCell')}>
                <span className='font-mono'>{formatSciNode(sel.unitCellFormula)}</span>
              </Prop>
              <Prop label={t('propSites')}>
                <span className='tabular-nums'>{sel.nat}</span>
              </Prop>
              <Prop label={t('propMaterialId')}>
                {sel.mpId ? (
                  <a
                    href={`https://materialsproject.org/materials/${sel.mpId}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='font-mono underline-offset-2 hover:underline'
                  >
                    {sel.mpId}
                  </a>
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </Prop>
            </div>
          </div>
          <Button asChild className='w-fit'>
            <Link href={`/dashboard/computation/compose?structure=${sel.id}`}>
              <IconRocket className='mr-1 size-4' />
              {t('runDft')}
            </Link>
          </Button>
        </div>
      </div>

      <StructuresTable rows={rows} selectedId={selectedId} onSelectRow={setSelectedId} />
    </div>
  );
}
