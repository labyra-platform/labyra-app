/**
 * CrystallinityCard — render crystallinity classification + size estimate.
 *
 * @phase R185-10a
 */
'use client';

import { IconAtom } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { CitationChip } from '@/components/citation-chip';
import { ConfidenceMeter } from '@/components/deviation/confidence-meter';
import type { Crystallinity } from '@/types/deviation-analysis';

interface CrystallinityCardProps {
  crystallinity: Crystallinity;
}

const CLASSIFICATION_STYLES: Record<string, string> = {
  bulk: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  nanocrystalline: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  amorphous: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  mixed: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
  unknown: 'bg-muted text-muted-foreground'
};

export function CrystallinityCard({ crystallinity }: CrystallinityCardProps) {
  const style =
    CLASSIFICATION_STYLES[crystallinity.classification] ?? CLASSIFICATION_STYLES.unknown;

  return (
    <section
      className='rounded-md border border-border bg-card p-4 space-y-3'
      aria-labelledby='crystallinity-heading'
    >
      <header className='flex items-center gap-2'>
        <IconAtom className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
        <h3 id='crystallinity-heading' className='text-sm font-medium'>
          Crystallinity
        </h3>
        <Badge variant='outline' className={`ml-auto font-medium ${style}`}>
          {crystallinity.classification}
        </Badge>
      </header>

      <div className='space-y-2'>
        <div className='flex items-center gap-2 text-xs'>
          <span className='text-muted-foreground'>Confidence</span>
          <ConfidenceMeter value={crystallinity.confidence} className='flex-1' />
        </div>

        {crystallinity.size_estimate && (
          <div className='bg-muted/40 rounded p-2 text-xs space-y-1'>
            <p className='font-medium text-muted-foreground'>Estimated crystallite size</p>
            <p className='text-foreground'>
              <span className='tabular-nums font-semibold'>
                {crystallinity.size_estimate.value_nm.toFixed(1)}
              </span>
              {' ± '}
              <span className='tabular-nums'>
                {crystallinity.size_estimate.uncertainty_nm.toFixed(1)}
              </span>
              {' nm'}
              <span className='text-muted-foreground ml-2'>
                ({crystallinity.size_estimate.method})
              </span>
            </p>
            {crystallinity.size_estimate.notes && (
              <p className='text-muted-foreground'>{crystallinity.size_estimate.notes}</p>
            )}
            {crystallinity.size_estimate.citation && (
              <div className='pt-1'>
                <CitationChip citation={crystallinity.size_estimate.citation} />
              </div>
            )}
          </div>
        )}

        {crystallinity.reasoning.length > 0 && (
          <details className='text-xs'>
            <summary className='cursor-pointer text-muted-foreground hover:text-foreground transition-colors motion-reduce:transition-none'>
              Reasoning ({crystallinity.reasoning.length} signals)
            </summary>
            <ul className='mt-2 space-y-1 pl-4 list-disc text-foreground/90'>
              {crystallinity.reasoning.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
