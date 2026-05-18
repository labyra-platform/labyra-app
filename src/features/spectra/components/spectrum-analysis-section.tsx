'use client';

/**
 * SpectrumAnalysisSection — dispatch chart by type (extended).
 * @phase R160-spectra-3c-hotfix3
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AddReferenceCardDialog } from '@/features/spectra/components/add-reference-card-dialog';
import { AnalysisResultCard } from '@/features/spectra/components/analysis-result-card';
import { DRSChart } from '@/features/spectra/components/drs-chart';
// R163-4c-5c1
import { MultiCitationsPanel } from '@/features/spectra/components/multi-citations-panel';
import { ReferenceCardsManager } from '@/features/spectra/components/reference-cards-manager';
import { SpectrumChart } from '@/features/spectra/components/spectrum-chart';
import { DSCChart, OCPChart, TGAChart } from '@/features/spectra/components/spectrum-chart-ext';
import { TaucChart } from '@/features/spectra/components/tauc-chart';
import { XRDPeakDetailTable } from '@/features/spectra/components/xrd-peak-detail-table';
import { XRDPhaseSummary } from '@/features/spectra/components/xrd-phase-summary';
import { XRDQualityCard } from '@/features/spectra/components/xrd-quality-card';
import { useReferenceCards } from '@/features/spectra/hooks/use-reference-cards';
import { getFirebaseAuth } from '@/lib/firebase/client';
import {
  computeInternalCandidates,
  computeMultiInternalCandidates
} from '@/lib/spectra/internal-candidates';
import type { AnalysisResult } from '@/types/spectra-analysis';

interface SpectrumAnalysisSectionProps {
  spectrumId: string;
  status: string;
}

export function SpectrumAnalysisSection({ spectrumId, status }: SpectrumAnalysisSectionProps) {
  const [addRefOpen, setAddRefOpen] = useState(false);
  const [manageRefOpen, setManageRefOpen] = useState(false);
  const { activeCards, allCards, toggleCard, refresh } = useReferenceCards();
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
        const res = await fetch(`/api/measurements/${spectrumId}/analysis`, {
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

  // R162-hooks-fix — useMemo must be called before any conditional return
  // (React Rules of Hooks). Null-safe via optional chaining on result.
  const mergedCandidates = useMemo(() => {
    const parsed = result?.parsed;
    if (!parsed || parsed.spectrum_type !== 'xrd') return [];
    const workerCandidates = parsed.citation?.candidates ?? [];
    const internal = computeInternalCandidates(parsed.peaks ?? [], allCards);
    return [...workerCandidates, ...internal].toSorted((a, b) => b.match_score - a.match_score);
  }, [result, allCards]);

  // R163-4c-5c1: multi-type candidates for FTIR/Raman/UV-Vis
  const multiCandidates = useMemo(() => {
    const parsed = result?.parsed;
    if (!parsed) return [];
    return computeMultiInternalCandidates(parsed, allCards);
  }, [result, allCards]);

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
        <div className='rounded-lg border bg-card p-4 space-y-2'>
          {/* R163-4c-5c1: + Add reference for all 4 types */}
          {(parsed.spectrum_type === 'xrd' ||
            parsed.spectrum_type === 'ftir' ||
            parsed.spectrum_type === 'raman' ||
            parsed.spectrum_type === 'uvvis') && (
            <div className='flex flex-wrap gap-2 items-center'>
              <Button type='button' variant='outline' size='sm' onClick={() => setAddRefOpen(true)}>
                + Add reference
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => setManageRefOpen(true)}
              >
                Manage ({allCards.length})
              </Button>
              {activeCards.length > 0 && (
                <span className='text-xs text-muted-foreground'>
                  {activeCards.length} active overlay
                  {activeCards.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
          <SpectrumChart
            parsed={parsed}
            // R163-4c-2-overlay: filter XRD-only for chart overlay
            referenceCards={activeCards
              .filter((c) => c.spectrumType === 'xrd')
              .map((c) => ({
                id: c.id,
                cardNumber: c.cardNumber,
                phaseName: c.phaseName,
                color: c.color,
                peaks: (c as import('@/types/spectra').XRDReferenceCard).peaks.map((p) => ({
                  twoTheta: p.twoTheta,
                  intensity: p.intensity,
                  hkl: p.hkl
                }))
              }))}
          />
        </div>
      )}
      {parsed.spectrum_type === 'xrd' && (
        <XRDQualityCard
          quality={parsed.quality_metrics}
          wavelength={parsed.wavelength_angstrom}
          source={parsed.source}
          crystallinity={parsed.crystallinity_percent}
        />
      )}
      {parsed.spectrum_type === 'xrd' && <XRDPeakDetailTable peaks={parsed.peaks} />}
      {parsed.spectrum_type === 'xrd' && mergedCandidates.length > 0 && (
        <XRDPhaseSummary candidates={mergedCandidates} />
      )}

      {/* R163-4c-5c1: Multi-type citations panel */}
      {(parsed.spectrum_type === 'ftir' ||
        parsed.spectrum_type === 'raman' ||
        parsed.spectrum_type === 'uvvis') &&
        multiCandidates.length > 0 && (
          <MultiCitationsPanel
            candidates={multiCandidates}
            userPeaks={(parsed.peaks ?? []) as never}
          />
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
      <AddReferenceCardDialog open={addRefOpen} onOpenChange={setAddRefOpen} onCreated={refresh} />
      <ReferenceCardsManager
        open={manageRefOpen}
        onOpenChange={setManageRefOpen}
        cards={allCards}
        activeIds={activeCards.map((c) => c.id)}
        onToggle={toggleCard}
        onChanged={refresh}
      />
    </div>
  );
}
