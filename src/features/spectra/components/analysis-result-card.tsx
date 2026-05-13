'use client';

/**
 * AnalysisResultCard — display AI interpretation, type-aware.
 * @phase R160-spectra-3c (extended for UV-Vis, Raman, FTIR)
 */

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type {
  AnalysisResult,
  ConfidenceLevel,
  FTIRAIOutput,
  RamanAIOutput,
  UVVisAIOutput,
  XRDAIOutput
} from '@/types/spectra-analysis';

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
  const { ai, parsed, analysisVersion, spectrumType } = result;

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
        {/* Summary - common to all types */}
        <div>
          <h4 className='text-sm font-medium text-muted-foreground'>{t('summary')}</h4>
          <p className='mt-1 text-sm leading-relaxed'>{ai.summary}</p>
        </div>

        <Separator />

        {/* Type-specific body */}
        {spectrumType === 'xrd' && <XRDBody ai={ai as XRDAIOutput} parsed={parsed} t={t} />}
        {spectrumType === 'uvvis' && <UVVisBody ai={ai as UVVisAIOutput} t={t} />}
        {spectrumType === 'raman' && <RamanBody ai={ai as RamanAIOutput} t={t} />}
        {spectrumType === 'ftir' && <FTIRBody ai={ai as FTIRAIOutput} t={t} />}

        {/* Warnings - common */}
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

        {/* Next steps - common */}
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

// ============================================================
// XRD body
// ============================================================
function XRDBody({
  ai,
  parsed,
  t
}: {
  ai: XRDAIOutput;
  parsed: AnalysisResult['parsed'];
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <>
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

      {parsed.spectrum_type === 'xrd' && parsed.williamson_hall && (
        <div className='rounded-md bg-muted p-3 text-xs'>
          <strong>W-H fit:</strong> R² = {parsed.williamson_hall.r_squared} (
          {parsed.williamson_hall.n_peaks_used} peaks)
        </div>
      )}
    </>
  );
}

// ============================================================
// UV-Vis body
// ============================================================
function UVVisBody({
  ai,
  t
}: {
  ai: UVVisAIOutput;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <>
      {ai.bandgap.value_ev !== null && (
        <div className='rounded-md border p-3'>
          <div className='flex items-center justify-between'>
            <h4 className='text-sm font-medium text-muted-foreground'>{t('bandgap')}</h4>
            <Badge variant={confidenceVariant(ai.bandgap.confidence)} className='text-xs'>
              {t(`confidence.${ai.bandgap.confidence}`)}
            </Badge>
          </div>
          <p className='mt-1 text-2xl font-semibold'>
            {ai.bandgap.value_ev} <span className='text-sm font-normal'>eV</span>
          </p>
          {ai.bandgap.transition && (
            <p className='mt-1 text-xs text-muted-foreground'>
              {t('transition')}: {ai.bandgap.transition}
            </p>
          )}
        </div>
      )}

      {ai.absorption_features.length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className='text-sm font-medium text-muted-foreground'>{t('absorptionFeatures')}</h4>
            <div className='mt-2 space-y-2'>
              {ai.absorption_features.map((feat, i) => (
                <div key={i} className='rounded-md border p-3'>
                  <div className='flex items-center justify-between'>
                    <span className='font-medium'>{feat.assignment}</span>
                    <span className='text-xs text-muted-foreground'>{feat.wavelength_nm} nm</span>
                  </div>
                  {feat.note && <p className='mt-1 text-xs text-muted-foreground'>{feat.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ============================================================
// Raman body
// ============================================================
function RamanBody({
  ai,
  t
}: {
  ai: RamanAIOutput;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <>
      {ai.likely_material && (
        <div className='rounded-md border p-3'>
          <h4 className='text-sm font-medium text-muted-foreground'>{t('likelyMaterial')}</h4>
          <p className='mt-1 text-lg font-semibold'>{ai.likely_material}</p>
        </div>
      )}

      {ai.vibrational_modes.length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className='text-sm font-medium text-muted-foreground'>{t('vibrationalModes')}</h4>
            <div className='mt-2 space-y-2'>
              {ai.vibrational_modes.map((mode, i) => (
                <div key={i} className='rounded-md border p-3'>
                  <div className='flex items-center justify-between'>
                    <span className='font-medium'>{mode.assignment}</span>
                    <span className='text-xs text-muted-foreground'>{mode.shift_cm1} cm⁻¹</span>
                  </div>
                  {mode.note && <p className='mt-1 text-xs text-muted-foreground'>{mode.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {ai.carbon_interpretation && (
        <>
          <Separator />
          <div className='rounded-md bg-muted p-3'>
            <h4 className='text-sm font-medium'>{t('carbonAnalysis')}</h4>
            <p className='mt-1 text-sm'>{ai.carbon_interpretation}</p>
          </div>
        </>
      )}
    </>
  );
}

// ============================================================
// FTIR body
// ============================================================
function FTIRBody({
  ai,
  t
}: {
  ai: FTIRAIOutput;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <>
      {ai.likely_compound_class && (
        <div className='rounded-md border p-3'>
          <h4 className='text-sm font-medium text-muted-foreground'>{t('compoundClass')}</h4>
          <p className='mt-1 text-lg font-semibold'>{ai.likely_compound_class}</p>
        </div>
      )}

      {ai.functional_groups.length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className='text-sm font-medium text-muted-foreground'>{t('functionalGroups')}</h4>
            <div className='mt-2 space-y-2'>
              {ai.functional_groups.map((group, i) => (
                <div key={i} className='rounded-md border p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='font-medium'>{group.name}</span>
                    <div className='flex items-center gap-2'>
                      <Badge variant={confidenceVariant(group.confidence)} className='text-xs'>
                        {t(`confidence.${group.confidence}`)}
                      </Badge>
                      <span className='text-xs text-muted-foreground'>
                        {group.wavenumber_cm1} cm⁻¹
                      </span>
                    </div>
                  </div>
                  {group.note && <p className='mt-1 text-xs text-muted-foreground'>{group.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
