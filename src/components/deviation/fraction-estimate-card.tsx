/**
 * FractionEstimateCard — per-phase mass fraction display.
 *
 * Critical: quantitative=true → "X ± Y % mass fraction" with method+citation
 *           quantitative=false → "Detected intensity ratio" with WARNING caveat
 *
 * @phase R185-10b
 */
'use client';

import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { CitationChip } from '@/components/citation-chip';
import { Badge } from '@/components/ui/badge';
import { formatFormula } from '@/lib/utils/format-formula';
import { cn } from '@/lib/utils';
import type { FractionEstimate } from '@/types/deviation-analysis';

interface FractionEstimateCardProps {
  estimate: FractionEstimate;
}

const METHOD_LABELS: Record<string, string> = {
  rir: 'RIR (Chung 1974)',
  'direct-comparison': 'Direct Comparison (Klug-Alexander)',
  'lambert-beer': 'Lambert-Beer',
  'raman-intensity-ratio-qualitative': 'Raman intensity ratio',
  'peak-count-fallback': 'Peak count (loose)'
};

export function FractionEstimateCard({ estimate }: FractionEstimateCardProps) {
  const percent = (estimate.value * 100).toFixed(1);
  const uncertaintyPct = (estimate.uncertainty * 100).toFixed(1);
  const methodLabel = METHOD_LABELS[estimate.method] ?? estimate.method;

  return (
    <article
      className={cn(
        'rounded-md border p-3 space-y-2',
        estimate.quantitative
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-amber-500/30 bg-amber-500/5'
      )}
      aria-label={`Fraction estimate for ${estimate.formula}`}
    >
      <header className='flex items-start justify-between gap-2'>
        <div className='min-w-0'>
          <p className='font-medium font-mono text-sm'>{formatFormula(estimate.formula)}</p>
          <p className='text-xs text-muted-foreground mt-0.5'>{methodLabel}</p>
        </div>
        <Badge
          variant='outline'
          className={cn(
            'shrink-0 text-xs',
            estimate.quantitative
              ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'border-amber-500/30 text-amber-700 dark:text-amber-300'
          )}
        >
          {estimate.quantitative ? (
            <>
              <IconCheck className='h-3 w-3 mr-0.5' aria-hidden='true' /> Quantitative
            </>
          ) : (
            <>
              <IconAlertCircle className='h-3 w-3 mr-0.5' aria-hidden='true' /> Qualitative
            </>
          )}
        </Badge>
      </header>

      <div className='font-mono text-2xl font-semibold tabular-nums'>
        {percent}
        <span className='text-sm text-muted-foreground font-normal'> ± {uncertaintyPct}%</span>
      </div>

      {!estimate.quantitative && (
        <p className='text-xs text-amber-700 dark:text-amber-300 leading-snug'>
          NOT mass fraction. {estimate.caveat}
        </p>
      )}
      {estimate.quantitative && estimate.caveat && (
        <details className='text-xs'>
          <summary className='cursor-pointer text-muted-foreground hover:text-foreground transition-colors motion-reduce:transition-none'>
            Method assumptions
          </summary>
          <p className='mt-1 text-foreground/80 leading-snug'>{estimate.caveat}</p>
        </details>
      )}

      {estimate.citation && (
        <div className='pt-1'>
          <CitationChip citation={estimate.citation} />
        </div>
      )}
    </article>
  );
}
