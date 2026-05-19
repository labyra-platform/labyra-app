/**
 * ComponentMatchCard — match details for one declared phase in multi-phase sample.
 *
 * Compact summary; full hypotheses delegated to HypothesisCard list.
 *
 * @phase R185-10b
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { HypothesisCard } from '@/components/deviation/hypothesis-card';
import { MatchSummaryStats } from '@/components/deviation/match-summary-stats';
import { QualityGradeBadge } from '@/components/deviation/quality-grade-badge';
import { formatFormula } from '@/lib/utils/format-formula';
import { cn } from '@/lib/utils';
import type { ComponentMatch, Hypothesis } from '@/types/deviation-analysis';

interface ComponentMatchCardProps {
  component: ComponentMatch;
  unitLabel: string;
  hypotheses?: Hypothesis[];
}

const ROLE_STYLES: Record<string, string> = {
  matrix: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  core: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  shell: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
  support: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  filler: 'bg-muted text-muted-foreground',
  dopant: 'bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30',
  substrate: 'bg-muted text-muted-foreground'
};

export function ComponentMatchCard({
  component,
  unitLabel,
  hypotheses = []
}: ComponentMatchCardProps) {
  const roleStyle = ROLE_STYLES[component.role] ?? 'bg-muted text-muted-foreground';
  const sortedHyps = [...hypotheses].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2 flex-wrap'>
        <h3 className='font-mono text-base font-semibold'>{formatFormula(component.formula)}</h3>
        <Badge variant='outline' className={cn('text-xs', roleStyle)}>
          {component.role}
        </Badge>
        {component.nominal_fraction != null && (
          <Badge variant='outline' className='text-xs text-muted-foreground'>
            Declared {(component.nominal_fraction * 100).toFixed(0)}%
          </Badge>
        )}
        <span className='text-xs text-muted-foreground ml-auto'>
          {component.intended_peaks_observed} / {component.intended_peaks_total} peaks observed (
          {(component.intent_coverage * 100).toFixed(0)}% coverage)
        </span>
      </div>

      <MatchSummaryStats match={component.match_result} unitLabel={unitLabel} />

      {sortedHyps.length > 0 && (
        <div className='space-y-2'>
          <p className='text-xs font-medium text-muted-foreground'>
            Hypotheses for this phase ({sortedHyps.length})
          </p>
          {sortedHyps.map((h) => (
            <HypothesisCard key={h.rule_id} hypothesis={h} />
          ))}
        </div>
      )}
    </div>
  );
}
