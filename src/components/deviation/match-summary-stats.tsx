/**
 * MatchSummaryStats — high-level match metrics in a stats row.
 *
 * @phase R185-10a
 */
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { QualityGradeBadge } from '@/components/deviation/quality-grade-badge';
import { formatFormula } from '@/lib/utils/format-formula';
import type { MatchResult } from '@/types/deviation-analysis';

interface MatchSummaryStatsProps {
  match: MatchResult;
  unitLabel: string; // "cm⁻¹" for Raman, "°" for XRD, etc.
}

export function MatchSummaryStats({ match, unitLabel }: MatchSummaryStatsProps) {
  return (
    <Card>
      <CardContent className='pt-4 pb-4 space-y-3'>
        <div className='flex items-center justify-between gap-3 flex-wrap'>
          <div className='flex flex-col'>
            <span className='text-xs text-muted-foreground'>Reference</span>
            <span className='text-sm font-medium'>
              {formatFormula(match.reference_label || match.reference_formula)}
            </span>
          </div>
          <QualityGradeBadge grade={match.quality_grade} />
        </div>

        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm'>
          <div>
            <p className='text-xs text-muted-foreground'>Match rate</p>
            <p className='font-semibold tabular-nums'>{(match.match_rate * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>Matched / total</p>
            <p className='font-semibold tabular-nums'>
              {match.match_count} / {match.match_count + match.unmatched_ref.length}
            </p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>Mean |Δ|</p>
            <p className='font-semibold tabular-nums'>
              {match.mean_abs_deviation.toFixed(2)} {unitLabel}
            </p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>RMSE</p>
            <p className='font-semibold tabular-nums'>
              {match.rmse.toFixed(2)} {unitLabel}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
