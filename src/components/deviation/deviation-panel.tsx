/**
 * DeviationPanel — top-level container, routes to single-phase or multi-phase view.
 *
 * @phase R185-10a + R185-10b
 */
'use client';

import { IconChartBar, IconChartPie, IconFlask, IconReportAnalytics } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { Panel, PanelEmpty } from '@/components/ui-extra/panel';
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
  const t = useTranslations('deviation');
  if (!deviation) {
    return (
      <Panel title={t('panel.title')} icon={IconReportAnalytics}>
        <PanelEmpty description={t('panel.emptyState')} title={t('panel.title')} />
      </Panel>
    );
  }

  // ── Multi-phase view ────────────────────────────────────────────────────
  if (deviation.mode === 'multi-phase') {
    return (
      <div className='space-y-4'>
        <Panel title={t('multiPhase.title')} icon={IconFlask}>
          <MultiPhaseTabs deviation={deviation} unitLabel={unitLabel} />
        </Panel>

        {deviation.fractionEstimates && deviation.fractionEstimates.length > 0 && (
          <Panel title={t('fraction.phaseFractions')} icon={IconChartPie}>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
              {deviation.fractionEstimates.map((fe) => (
                <FractionEstimateCard key={fe.formula} estimate={fe} />
              ))}
            </div>
          </Panel>
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
      <Panel title={t('panel.title')} icon={IconReportAnalytics}>
        <div className='space-y-4'>
          {deviation.matchResult && (
            <MatchSummaryStats match={deviation.matchResult} unitLabel={unitLabel} />
          )}

          {deviation.crystallinity && <CrystallinityCard crystallinity={deviation.crystallinity} />}
        </div>
      </Panel>

      {sortedHypotheses.length > 0 && (
        <Panel
          title={t('hypothesis.hypothesesTitle', { count: sortedHypotheses.length })}
          icon={IconChartBar}
        >
          <div className='space-y-2'>
            {sortedHypotheses.map((h) => (
              <HypothesisCard key={h.rule_id} hypothesis={h} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
