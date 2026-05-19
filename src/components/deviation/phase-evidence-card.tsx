/**
 * PhaseEvidenceCard — per-phase verdict + supporting spectra.
 *
 * @phase R185-10c
 */
'use client';

import { IconAlertTriangle, IconCheck, IconHelpCircle, IconX } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { ConfidenceMeter } from '@/components/deviation/confidence-meter';
import { formatFormula } from '@/lib/utils/format-formula';
import { cn } from '@/lib/utils';
import type { ConsistencyVerdict, PhaseEvidence } from '@/types/deviation-analysis';

interface PhaseEvidenceCardProps {
  evidence: PhaseEvidence;
}

const VERDICT_CONFIG: Record<
  ConsistencyVerdict,
  {
    icon: typeof IconCheck;
    label: string;
    badgeClass: string;
    borderClass: string;
  }
> = {
  confirmed: {
    icon: IconCheck,
    label: 'Confirmed',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    borderClass: 'border-l-emerald-500'
  },
  partial: {
    icon: IconHelpCircle,
    label: 'Partial',
    badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
    borderClass: 'border-l-sky-500'
  },
  missing: {
    icon: IconX,
    label: 'Missing',
    badgeClass: 'bg-muted text-muted-foreground',
    borderClass: 'border-l-muted-foreground'
  },
  conflict: {
    icon: IconAlertTriangle,
    label: 'Conflict',
    badgeClass: 'bg-destructive/10 text-destructive border-destructive/30',
    borderClass: 'border-l-destructive'
  }
};

export function PhaseEvidenceCard({ evidence }: PhaseEvidenceCardProps) {
  const cfg = VERDICT_CONFIG[evidence.verdict];
  const Icon = cfg.icon;

  return (
    <article
      className={cn(
        'rounded-md border border-border border-l-4 bg-card p-4 space-y-3',
        cfg.borderClass
      )}
      aria-labelledby={`phase-${evidence.formula}`}
    >
      <header className='flex items-center gap-2 flex-wrap'>
        <Icon className='h-4 w-4 text-muted-foreground shrink-0' aria-hidden='true' />
        <h4 id={`phase-${evidence.formula}`} className='font-mono font-semibold text-sm'>
          {formatFormula(evidence.formula)}
        </h4>
        <Badge variant='outline' className={cn('text-xs', cfg.badgeClass)}>
          {cfg.label}
        </Badge>
        <Badge variant='outline' className='text-xs text-muted-foreground capitalize'>
          {evidence.role}
        </Badge>
      </header>

      <div className='space-y-2'>
        <div className='flex items-center gap-2 text-xs'>
          <span className='text-muted-foreground shrink-0'>Cross-spectrum score</span>
          <ConfidenceMeter value={evidence.consistency_score} className='flex-1' />
        </div>

        {evidence.spectra_supporting.length > 0 && (
          <div className='flex gap-1.5 flex-wrap'>
            <span className='text-xs text-muted-foreground'>Supported by:</span>
            {evidence.spectra_supporting.map((item, i) => (
              <Badge key={i} variant='outline' className='text-xs font-normal uppercase'>
                {item.spectrum_type}
              </Badge>
            ))}
          </div>
        )}

        {evidence.spectra_missing.length > 0 && (
          <p className='text-xs text-muted-foreground'>
            Missing from {evidence.spectra_missing.length} spectrum(a)
          </p>
        )}

        {evidence.reasoning.length > 0 && (
          <ul className='text-xs space-y-1 pl-4 list-disc text-foreground/80'>
            {evidence.reasoning.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
