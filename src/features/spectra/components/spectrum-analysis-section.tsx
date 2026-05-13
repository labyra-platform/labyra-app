'use client';

/**
 * SpectrumAnalysisSection — client component.
 * Fetches AnalysisResult via authenticated API endpoint.
 * @phase R160-spectra-3c (extended for UV-Vis, Raman, FTIR)
 */

import { useEffect, useState } from 'react';

import { AnalysisResultCard } from '@/features/spectra/components/analysis-result-card';
import { SpectrumChart } from '@/features/spectra/components/spectrum-chart';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { AnalysisResult } from '@/types/spectra-analysis';

interface SpectrumAnalysisSectionProps {
  spectrumId: string;
  status: string;
}

const SUPPORTED_CHART_TYPES = new Set(['xrd', 'uvvis', 'raman', 'ftir']);

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
  if (loading) {
    return <div className='text-sm text-muted-foreground'>Loading analysis…</div>;
  }
  if (!result) return null;

  const hasChartSupport =
    SUPPORTED_CHART_TYPES.has(result.spectrumType) && result.parsed.peaks.length > 0;

  return (
    <div className='space-y-6'>
      <AnalysisResultCard result={result} />
      {hasChartSupport && (
        <div className='rounded-lg border bg-card p-4'>
          <SpectrumChart parsed={result.parsed} />
        </div>
      )}
    </div>
  );
}
