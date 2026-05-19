/**
 * DeviationPanel — top-level container, routes to single-phase or multi-phase view.
 *
 * @phase R185-10a + R185-10b
 */
'use client';

import { IconChartBar, IconChartPie, IconFlask, IconReportAnalytics } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CrystallinityCard } from '@/components/deviation/crystallinity-card';
import { FractionEstimateCard } from '@/components/deviation/fraction-estimate-card';
import { HypothesisCard } from '@/components/deviation/hypothesis-card';
import { MatchSummaryStats } from '@/components/deviation/match-summary-stats';
import { MultiPhaseTabs } from '@/components/deviation/multi-phase-tabs';
import { RietveldResultCard } from '@/components/deviation/rietveld-result-card';
import type { DeviationAnalysis } from '@/types/deviation-analysis';

interface DeviationPanelProps {
  deviation: DeviationAnalysis | null | undefined;
  unitLabel: string;
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

  // ── Multi-phase view ────────────────────────────────────────────────────
  if (deviation.mode === 'multi-phase') {
    return (
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <IconFlask className='h-4 w-4' aria-hidden='true' />
              Multi-phase analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MultiPhaseTabs deviation={deviation} unitLabel={unitLabel} />
          </CardContent>
        </Card>

        {deviation.fractionEstimates && deviation.fractionEstimates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <IconChartPie className='h-4 w-4' aria-hidden='true' />
                Phase fractions
              </CardTitle>
            </CardHeader>
            <CardContent className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
              {deviation.fractionEstimates.map((fe) => (
                <FractionEstimateCard key={fe.formula} estimate={fe} />
              ))}
            </CardContent>
          </Card>
        )}

        {deviation.rietveld && <RietveldResultCard rietveld={deviation.rietveld} />}
      </div>
    );
  }

  // ── Single-phase view ───────────────────────────────────────────────────
  const hypotheses = deviation.hypotheses ?? [];
  const sortedHypotheses = [...hypotheses].toSorted((a, b) => b.confidence - a.confidence);

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
