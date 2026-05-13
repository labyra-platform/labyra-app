'use client';

/**
 * Body components for TGA, DSC, OCP analysis results.
 * @phase R160-spectra-3c-hotfix3
 */

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SciText } from '@/features/spectra/utils/format-units';
import type { ConfidenceLevel } from '@/types/spectra-analysis';
import type { DSCAIOutput, OCPAIOutput, TGAAIOutput } from '@/types/spectra-analysis-ext';

function confidenceVariant(level: ConfidenceLevel): 'default' | 'secondary' | 'destructive' {
  if (level === 'high') return 'default';
  if (level === 'medium') return 'secondary';
  return 'destructive';
}

export function TGABody({ ai }: { ai: TGAAIOutput }) {
  const t = useTranslations('spectra.analysis');
  return (
    <>
      {ai.stages_interpretation.length > 0 && (
        <div>
          <h4 className='text-sm font-medium text-muted-foreground'>{t('decompStages')}</h4>
          <div className='mt-2 space-y-2'>
            {ai.stages_interpretation.map((stage, i) => (
              <div key={i} className='rounded-md border p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>
                    {t('stage')} {stage.stage}: <SciText>{stage.assignment}</SciText>
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {stage.temp_range_C[0]}–{stage.temp_range_C[1]} °C
                  </span>
                </div>
                {stage.note && (
                  <p className='mt-1 text-xs text-muted-foreground'>
                    <SciText>{stage.note}</SciText>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {ai.estimated_composition && (
        <>
          <Separator />
          <div className='rounded-md bg-muted p-3'>
            <h4 className='text-sm font-medium'>{t('estimatedComposition')}</h4>
            <p className='mt-1 text-sm'>
              <SciText>{ai.estimated_composition}</SciText>
            </p>
          </div>
        </>
      )}

      {ai.thermal_stability && (
        <div className='rounded-md bg-muted p-3'>
          <h4 className='text-sm font-medium'>{t('thermalStability')}</h4>
          <p className='mt-1 text-sm'>
            <SciText>{ai.thermal_stability}</SciText>
          </p>
        </div>
      )}
    </>
  );
}

export function DSCBody({ ai }: { ai: DSCAIOutput }) {
  const t = useTranslations('spectra.analysis');
  return (
    <>
      {ai.likely_material_class && (
        <div className='rounded-md border p-3'>
          <h4 className='text-sm font-medium text-muted-foreground'>{t('likelyMaterialClass')}</h4>
          <p className='mt-1 text-lg font-semibold'>{ai.likely_material_class}</p>
        </div>
      )}

      {ai.thermal_events.length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className='text-sm font-medium text-muted-foreground'>{t('thermalEvents')}</h4>
            <div className='mt-2 space-y-2'>
              {ai.thermal_events.map((evt, i) => (
                <div key={i} className='rounded-md border p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='font-medium'>
                      <Badge
                        variant={evt.direction === 'endo' ? 'default' : 'secondary'}
                        className='mr-2 text-xs'
                      >
                        {evt.type}
                      </Badge>
                      <SciText>{evt.assignment}</SciText>
                    </span>
                    <span className='text-xs text-muted-foreground'>{evt.temp_C} °C</span>
                  </div>
                  {evt.note && (
                    <p className='mt-1 text-xs text-muted-foreground'>
                      <SciText>{evt.note}</SciText>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function OCPBody({ ai }: { ai: OCPAIOutput }) {
  const t = useTranslations('spectra.analysis');
  return (
    <>
      <div className='rounded-md border p-3'>
        <h4 className='text-sm font-medium text-muted-foreground'>{t('equilibriumPotential')}</h4>
        <p className='mt-1 text-2xl font-semibold'>
          {ai.equilibrium_potential_V.toFixed(3)} <span className='text-sm font-normal'>V</span>
        </p>
      </div>

      {ai.stability_assessment && (
        <div className='rounded-md bg-muted p-3'>
          <h4 className='text-sm font-medium'>{t('stabilityAssessment')}</h4>
          <p className='mt-1 text-sm'>
            <SciText>{ai.stability_assessment}</SciText>
          </p>
        </div>
      )}

      {ai.physical_meaning && (
        <div className='rounded-md bg-muted p-3'>
          <h4 className='text-sm font-medium'>{t('physicalMeaning')}</h4>
          <p className='mt-1 text-sm'>
            <SciText>{ai.physical_meaning}</SciText>
          </p>
        </div>
      )}
    </>
  );
}
