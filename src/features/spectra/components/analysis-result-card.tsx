'use client';

/**
 * AnalysisResultCard — display AI interpretation of a spectrum.
 * @phase R160-spectra-3b
 */

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { AnalysisResult, ConfidenceLevel } from '@/types/spectra-analysis';

interface AnalysisResultCardProps {
  result: AnalysisResult;
}

function confidenceVariant(level: ConfidenceLevel): 'default' | 'secondary' | 'destructive' {
  if (level === 'high') return 'default';
  if (level === 'medium') return 'secondary';
  return 'destructive';
}

export function AnalysisResultCard({ result }: AnalysisResultCardProps) {
  const t = useTranslations('spectra.analysis');
  const { ai, parsed, analysisVersion } = result;

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-4'>
          <CardTitle className='flex items-center gap-2'>
            {t('title')}
            <Badge variant={confidenceVariant(ai.overall_confidence)}>
              {t(`confidence.${ai.overall_confidence}`)}
            </Badge>
          </CardTitle>
          <span className='text-xs text-muted-foreground'>v{analysisVersion}</span>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Summary */}
        <div>
          <h4 className='text-sm font-medium text-muted-foreground'>{t('summary')}</h4>
          <p className='mt-1 text-sm leading-relaxed'>{ai.summary}</p>
        </div>

        <Separator />

        {/* Phases */}
        <div>
          <h4 className='text-sm font-medium text-muted-foreground'>{t('phases')}</h4>
          <div className='mt-2 space-y-2'>
            {ai.phases.map((phase, i) => (
              <div key={`${phase.name}-${i}`} className='rounded-md border p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>{phase.name}</span>
                  <div className='flex items-center gap-2'>
                    <Badge variant={confidenceVariant(phase.confidence)} className='text-xs'>
                      {t(`confidence.${phase.confidence}`)}
                    </Badge>
                    <span className='text-xs text-muted-foreground'>
                      {t('matchedPeaks', { count: phase.matched_peaks })}
                    </span>
                  </div>
                </div>
                {phase.note && <p className='mt-1 text-xs text-muted-foreground'>{phase.note}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Crystallite size + microstrain */}
        {(ai.crystallite_size_nm !== null || ai.microstrain !== null) && (
          <>
            <Separator />
            <div className='grid grid-cols-2 gap-4'>
              {ai.crystallite_size_nm !== null && (
                <div>
                  <h4 className='text-sm font-medium text-muted-foreground'>
                    {t('crystalliteSize')}
                  </h4>
                  <p className='mt-1 text-lg font-semibold'>
                    {ai.crystallite_size_nm} <span className='text-sm font-normal'>nm</span>
                  </p>
                </div>
              )}
              {ai.microstrain !== null && (
                <div>
                  <h4 className='text-sm font-medium text-muted-foreground'>{t('microstrain')}</h4>
                  <p className='mt-1 text-lg font-semibold'>{ai.microstrain.toExponential(2)}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Williamson-Hall fit quality */}
        {parsed.williamson_hall && (
          <div className='rounded-md bg-muted p-3 text-xs'>
            <strong>W-H fit:</strong> R² = {parsed.williamson_hall.r_squared} (
            {parsed.williamson_hall.n_peaks_used} peaks)
          </div>
        )}

        {/* Warnings */}
        {ai.warnings.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className='text-sm font-medium text-amber-600 dark:text-amber-400'>
                {t('warnings')}
              </h4>
              <ul className='mt-2 space-y-1 text-sm'>
                {ai.warnings.map((w, i) => (
                  <li key={i} className='flex gap-2'>
                    <span className='text-amber-500'>⚠</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Next steps */}
        {ai.next_steps.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className='text-sm font-medium text-muted-foreground'>{t('nextSteps')}</h4>
              <ul className='mt-2 list-inside list-disc space-y-1 text-sm'>
                {ai.next_steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
