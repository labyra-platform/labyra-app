/**
 * MultiPhaseTabs — per-component tabs for multi-phase deviation analysis.
 *
 * Tabs: one per declared component, with a summary tab first.
 *
 * @phase R185-10b
 */
'use client';

import { IconAlertTriangle, IconFlask } from '@tabler/icons-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ComponentMatchCard } from '@/components/deviation/component-match-card';
import { HypothesisCard } from '@/components/deviation/hypothesis-card';
import { formatFormula } from '@/lib/utils/format-formula';
import type { DeviationAnalysis } from '@/types/deviation-analysis';

interface MultiPhaseTabsProps {
  deviation: DeviationAnalysis;
  unitLabel: string;
}

export function MultiPhaseTabs({ deviation, unitLabel }: MultiPhaseTabsProps) {
  const multi = deviation.multiPhase;
  if (!multi) return null;

  const compositeHyps = deviation.compositeHypotheses ?? [];
  const sortedCompositeHyps = [...compositeHyps].sort((a, b) => b.confidence - a.confidence);

  return (
    <Tabs defaultValue='_summary' className='w-full'>
      <TabsList className='flex flex-wrap h-auto justify-start'>
        <TabsTrigger value='_summary' className='gap-1'>
          <IconFlask className='h-3.5 w-3.5' aria-hidden='true' />
          Summary
        </TabsTrigger>
        {multi.components.map((c) => (
          <TabsTrigger key={c.formula} value={c.formula} className='font-mono'>
            {formatFormula(c.formula)}
          </TabsTrigger>
        ))}
        {sortedCompositeHyps.length > 0 && (
          <TabsTrigger value='_composite' className='gap-1'>
            <IconAlertTriangle className='h-3.5 w-3.5' aria-hidden='true' />
            Composite ({sortedCompositeHyps.length})
          </TabsTrigger>
        )}
      </TabsList>

      {/* Summary tab */}
      <TabsContent value='_summary' className='space-y-4 mt-4'>
        <Card>
          <CardContent className='pt-4 pb-4 space-y-3'>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm'>
              <div>
                <p className='text-xs text-muted-foreground'>Components</p>
                <p className='font-semibold tabular-nums'>{multi.components.length}</p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Overall match</p>
                <p className='font-semibold tabular-nums'>
                  {(multi.overall_match_rate * 100).toFixed(0)}%
                </p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Grade</p>
                <p className='font-semibold capitalize'>{multi.overall_grade}</p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Unassigned peaks</p>
                <p className='font-semibold tabular-nums'>{multi.unassigned_peaks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {multi.intended_but_not_observed.length > 0 && (
          <div
            role='alert'
            className='rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm'
          >
            <p className='font-medium text-amber-700 dark:text-amber-300 mb-1'>
              Declared but not observed
            </p>
            <p className='text-amber-700/90 dark:text-amber-300/90'>
              {multi.intended_but_not_observed.map((f) => formatFormula(f)).join(', ')}
              <span className='text-amber-700/70 dark:text-amber-300/70 ml-1'>
                — declared in sample composition but signatures were not detected.
              </span>
            </p>
          </div>
        )}

        {multi.unassigned_peaks.length > 0 && (
          <div className='rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1'>
            <p className='font-medium text-muted-foreground'>
              Peaks not explained by declared phases
            </p>
            <ul className='text-xs space-y-1 pl-4 list-disc text-foreground/80'>
              {multi.unassigned_peaks.slice(0, 5).map((p, i) => (
                <li key={i}>
                  {p.position.toFixed(2)} {unitLabel} (intensity {p.intensity.toFixed(0)})
                </li>
              ))}
              {multi.unassigned_peaks.length > 5 && (
                <li className='text-muted-foreground'>
                  ...and {multi.unassigned_peaks.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}
      </TabsContent>

      {/* Per-component tabs */}
      {multi.components.map((c) => (
        <TabsContent key={c.formula} value={c.formula} className='mt-4'>
          <ComponentMatchCard
            component={c}
            unitLabel={unitLabel}
            hypotheses={deviation.perComponentHypotheses?.[c.formula] ?? []}
          />
        </TabsContent>
      ))}

      {/* Composite hypotheses tab */}
      {sortedCompositeHyps.length > 0 && (
        <TabsContent value='_composite' className='mt-4 space-y-2'>
          <p className='text-sm text-muted-foreground'>
            Cross-phase phenomena (charge transfer, heterojunction, interface modes, ...)
          </p>
          {sortedCompositeHyps.map((h) => (
            <HypothesisCard key={h.rule_id} hypothesis={h} />
          ))}
        </TabsContent>
      )}
    </Tabs>
  );
}
