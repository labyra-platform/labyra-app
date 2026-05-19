/**
 * DeviationPanel — top-level container, routes to single-phase or multi-phase view.
 *
 * Single-phase: MatchSummary + Crystallinity + Hypotheses
 * Multi-phase: defer to R185-10b component (placeholder for now)
 *
 * @phase R185-10a
 */
'use client';

import { IconChartBar, IconFlask, IconReportAnalytics } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CrystallinityCard } from '@/components/deviation/crystallinity-card';
import { HypothesisCard } from '@/components/deviation/hypothesis-card';
import { MatchSummaryStats } from '@/components/deviation/match-summary-stats';
import type { DeviationAnalysis } from '@/types/deviation-analysis';

interface DeviationPanelProps {
  deviation: DeviationAnalysis | null | undefined;
  unitLabel: string; // "cm⁻¹" | "°" | "eV" | "nm"
}

export function DeviationPanel({ deviation, unitLabel }: DeviationPanelProps) {
  if (!deviation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <IconReportAnalytics className='h-4 w-4' aria-hidden='true' />
            Deviation analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>
            No deviation analysis available. The sample may not have a declared formula or
            composition, or the analysis has not run yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  // R185-10b will handle multi-phase mode — placeholder banner for now
  if (deviation.mode === 'multi-phase') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <IconFlask className='h-4 w-4' aria-hidden='true' />
            Multi-phase analysis
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <p className='text-sm text-muted-foreground'>
            {deviation.multiPhase?.components.length ?? 0} component(s) analyzed. Detailed
            multi-phase view ships in R185-10b.
          </p>
          {deviation.multiPhase?.intended_but_not_observed.length ? (
            <div className='text-sm bg-amber-500/10 border border-amber-500/30 rounded-md p-3'>
              <p className='font-medium text-amber-700 dark:text-amber-300'>
                Declared but not observed
              </p>
              <p className='text-amber-700/80 dark:text-amber-300/80 mt-1'>
                {deviation.multiPhase.intended_but_not_observed.join(', ')}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  // Single-phase view
  const hypotheses = deviation.hypotheses ?? [];
  const sortedHypotheses = [...hypotheses].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <IconReportAnalytics className='h-4 w-4' aria-hidden='true' />
            Deviation analysis
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {deviation.matchResult && (
            <MatchSummaryStats match={deviation.matchResult} unitLabel={unitLabel} />
          )}

          {deviation.crystallinity && <CrystallinityCard crystallinity={deviation.crystallinity} />}
        </CardContent>
      </Card>

      {sortedHypotheses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <IconChartBar className='h-4 w-4' aria-hidden='true' />
              Hypotheses ({sortedHypotheses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {sortedHypotheses.map((h) => (
              <HypothesisCard key={h.rule_id} hypothesis={h} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
