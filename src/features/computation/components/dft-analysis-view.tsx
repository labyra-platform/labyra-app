'use client';

/**
 * DFT analysis suite — derived electrochemistry from DFT total energies. Tools:
 * HER free energy ΔG(H*) and heterojunction band alignment. More (O-vacancy
 * formation, adsorption energy) can slot in as tabs.
 */
import { useState } from 'react';

import { DftBandAlignmentView } from '@/features/computation/components/dft-band-alignment-view';
import { DftHerAnalysisView } from '@/features/computation/components/dft-her-analysis-view';
import { cn } from '@/lib/utils';

/** A completed workflow's parsed energies, for auto-filling the analysis tools. */
export interface DftEnergyOption {
  id: string;
  name: string;
  energyRy: number | null;
  vbmEv: number | null;
  cbmEv: number | null;
}

type Tool = 'her' | 'bands';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'her', label: 'HER · ΔG(H*)' },
  { id: 'bands', label: 'Band alignment' }
];

export function DftAnalysisView({ workflows = [] }: { workflows?: DftEnergyOption[] }) {
  const [tool, setTool] = useState<Tool>('her');
  return (
    <div className='space-y-4'>
      <div className='inline-flex rounded-lg border p-0.5 text-sm'>
        {TOOLS.map((tItem) => (
          <button
            key={tItem.id}
            type='button'
            onClick={() => setTool(tItem.id)}
            className={cn(
              'rounded-md px-3 py-1.5 transition-colors',
              tool === tItem.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {tItem.label}
          </button>
        ))}
      </div>
      {tool === 'her' ? (
        <DftHerAnalysisView workflows={workflows} />
      ) : (
        <DftBandAlignmentView workflows={workflows} />
      )}
    </div>
  );
}
