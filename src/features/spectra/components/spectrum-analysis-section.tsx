'use client';

/**
 * SpectrumAnalysisSection — dispatch chart by type (extended).
 * @phase R160-spectra-3c-hotfix3
 */

import { useEffect, useState } from 'react';

import { AnalysisResultCard } from '@/features/spectra/components/analysis-result-card';
import { DRSChart } from '@/features/spectra/components/drs-chart';
import { SpectrumChart } from '@/features/spectra/components/spectrum-chart';
import { TaucChart } from '@/features/spectra/components/tauc-chart';
import { DSCChart, OCPChart, TGAChart } from '@/features/spectra/components/spectrum-chart-ext';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { AnalysisResult } from '@/types/spectra-analysis';

interface SpectrumAnalysisSectionProps {
  spectrumId: string;
  status: string;
}

export function SpectrumAnalysisSection({ spectrumId, status }: SpectrumAnalysisSectionProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status !== 'analyzed') return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const user = getFirebaseAuth().currentUser;
        if (!user) {
          if (!cancelled) setResult(null);
          return;
        }
        const token = await user.getIdToken();
        const res = await fetch(`/api/spectra/${spectrumId}/analysis`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          if (!cancelled) setResult(null);
          return;
        }
        const data = (await res.json()) as AnalysisResult;
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setResult(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spectrumId, status]);

  if (status !== 'analyzed') return null;
  if (loading) return <div className='text-sm text-muted-foreground'>Loading analysis…</div>;
  if (!result) return null;

  const { parsed } = result;

  // Defensive: skip render if parsed missing critical fields (worker partial fail)
  if (!parsed || typeof parsed !== 'object') {
    return (
      <div className='rounded-lg border bg-card p-4 text-sm text-muted-foreground'>
        Analysis data incomplete or malformed.
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <AnalysisResultCard result={result} />

      {/* Original 4 types */}
      {(parsed.spectrum_type === 'xrd' ||
        parsed.spectrum_type === 'uvvis' ||
        parsed.spectrum_type === 'raman' ||
        parsed.spectrum_type === 'ftir') && (
        <div className='rounded-lg border bg-card p-4'>
          <SpectrumChart parsed={parsed} />
        </div>
      )}

      {/* UV-Vis: add Tauc plot */}
      {parsed.spectrum_type === 'uvvis' && parsed.tauc_bandgap && (
        <div className='rounded-lg border bg-card p-4'>
          <TaucChart
            curve={parsed.tauc_curve}
            bandgap={parsed.tauc_bandgap}
            yLabel={`(αhν)^n (a.u.)`}
            title={`Tauc Plot — ${parsed.tauc_bandgap.transition}`}
          />
        </div>
      )}

      {/* UV-Vis DRS */}
      {parsed.spectrum_type === 'uvvis_drs' && (
        <>
          <div className='rounded-lg border bg-card p-4'>
            <DRSChart
              reflectance={parsed.reflectance_curve}
              km={parsed.km_curve}
              reflectanceMode={parsed.reflectance_mode}
            />
          </div>
          {parsed.tauc_bandgap && (
            <div className='rounded-lg border bg-card p-4'>
              <TaucChart
                curve={parsed.tauc_curve}
                bandgap={parsed.tauc_bandgap}
                yLabel={`(F(R)hν)^n (a.u.)`}
                title={`Tauc on Kubelka-Munk — ${parsed.tauc_bandgap.transition}`}
              />
            </div>
          )}
        </>
      )}

      {/* TGA */}
      {parsed.spectrum_type === 'tga' && (
        <div className='rounded-lg border bg-card p-4'>
          <TGAChart parsed={parsed} />
        </div>
      )}

      {/* DSC */}
      {parsed.spectrum_type === 'dsc' && (
        <div className='rounded-lg border bg-card p-4'>
          <DSCChart parsed={parsed} />
        </div>
      )}

      {/* OCP */}
      {parsed.spectrum_type === 'ocp' && (
        <div className='rounded-lg border bg-card p-4'>
          <OCPChart parsed={parsed} />
        </div>
      )}
    </div>
  );
}
