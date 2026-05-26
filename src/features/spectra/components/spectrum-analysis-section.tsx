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

// R185-10a-2: unit label for DeviationPanel
function _unitLabelFor(spectrumType: string): string {
  switch (spectrumType) {
    case 'raman':
    case 'ftir':
      return 'cm\u207B\u00B9'; // cm⁻¹
    case 'xrd':
      return '\u00B0'; // °
    case 'pl':
      return 'eV';
    case 'uvvis':
    case 'uvvis_drs':
      return 'nm';
    default:
      return '';
  }
}

export function SpectrumAnalysisSection({ spectrumId, status }: SpectrumAnalysisSectionProps) {
  const [addRefOpen, setAddRefOpen] = useState(false);
  const [manageRefOpen, setManageRefOpen] = useState(false);
  // R192-3: useReferenceCards can yield undefined arrays on first render in
  // some client-nav paths; coalesce here so every .length/.map below is safe.
  const {
    activeCards: _activeCards,
    allCards: _allCards,
    toggleCard,
    refresh
  } = useReferenceCards();
  const allCards = useMemo(() => _allCards ?? [], [_allCards]);
  const activeCards = useMemo(() => _activeCards ?? [], [_activeCards]);
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

  // R201-splitpane: master (text/analysis) + detail (chart) layout, mirroring
  // SciNote/Benchling. On lg+ the chart column is sticky so it stays in view
  // while the functional-group / analysis list on the left scrolls. Below lg
  // it collapses to a single stacked column (chart first for mobile context).
  const isCharted =
    parsed.spectrum_type === 'xrd' ||
    parsed.spectrum_type === 'uvvis' ||
    parsed.spectrum_type === 'raman' ||
    parsed.spectrum_type === 'ftir' ||
    parsed.spectrum_type === 'uvvis_drs' ||
    parsed.spectrum_type === 'tga' ||
    parsed.spectrum_type === 'dsc' ||
    parsed.spectrum_type === 'ocp';

  const canAddReference =
    parsed.spectrum_type === 'xrd' ||
    parsed.spectrum_type === 'ftir' ||
    parsed.spectrum_type === 'raman' ||
    parsed.spectrum_type === 'uvvis';

  // ── Detail column: all charts (kept in view via sticky) ──
  const chartColumn = (
    <div className='space-y-4'>
      {(parsed.spectrum_type === 'xrd' ||
        parsed.spectrum_type === 'uvvis' ||
        parsed.spectrum_type === 'raman' ||
        parsed.spectrum_type === 'ftir') && (
        <SpectrumChart
          parsed={parsed}
          measurementId={spectrumId}
          // R163-4c-2-overlay: filter XRD-only for chart overlay
          referenceCards={activeCards
            .filter((c) => c.spectrumType === 'xrd')
            .map((c) => ({
              id: c.id,
              cardNumber: c.cardNumber,
              phaseName: c.phaseName,
              color: c.color,
              // fs-guard-ok: activeCards pre-filtered to spectrumType==='xrd' above
              peaks: (c as import('@/types/spectra').XRDReferenceCard).peaks.map((p) => ({
                twoTheta: p.twoTheta,
                intensity: p.intensity,
                hkl: p.hkl
              }))
            }))}
        />
      )}

      {/* UV-Vis: Tauc plot */}
      {parsed.spectrum_type === 'uvvis' && parsed.tauc_bandgap && (
        <TaucChart
          curve={parsed.tauc_curve}
          bandgap={parsed.tauc_bandgap}
          yLabel={`(αhν)^n (a.u.)`}
          title={`Tauc Plot — ${parsed.tauc_bandgap.transition}`}
        />
      )}

      {/* UV-Vis DRS */}
      {parsed.spectrum_type === 'uvvis_drs' && (
        <>
          <DRSChart
            reflectance={parsed.reflectance_curve}
            km={parsed.km_curve}
            reflectanceMode={parsed.reflectance_mode}
          />
          {parsed.tauc_bandgap && (
            <TaucChart
              curve={parsed.tauc_curve}
              bandgap={parsed.tauc_bandgap}
              yLabel={`(F(R)hν)^n (a.u.)`}
              title={`Tauc on Kubelka-Munk — ${parsed.tauc_bandgap.transition}`}
            />
          )}
        </>
      )}

      {parsed.spectrum_type === 'tga' && <TGAChart parsed={parsed} />}
      {parsed.spectrum_type === 'dsc' && <DSCChart parsed={parsed} />}
      {parsed.spectrum_type === 'ocp' && <OCPChart parsed={parsed} />}
    </div>
  );

  // ── Master column: AI interpretation + reference controls + tables ──
  const analysisColumn = (
    <div className='space-y-6'>
      <AnalysisResultCard result={result} />

      {canAddReference && (
        <div className='flex flex-wrap items-center gap-2'>
          <Button type='button' variant='outline' size='sm' onClick={() => setAddRefOpen(true)}>
            + Add reference
          </Button>
          <Button type='button' variant='ghost' size='sm' onClick={() => setManageRefOpen(true)}>
            Manage ({allCards.length})
          </Button>
          {activeCards.length > 0 && (
            <span className='text-muted-foreground text-xs'>
              {activeCards.length} active overlay
              {activeCards.length > 1 ? 's' : ''}
            </span>
          )}
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
    </div>
  );

  return (
    <>
      {isCharted ? (
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-[minmax(360px,5fr)_7fr]'>
          {/* Master (text/analysis) — scrolls with the page */}
          <div className='min-w-0'>{analysisColumn}</div>
          {/* Detail (chart) — sticky below the app header on lg+ */}
          <div className='min-w-0 lg:sticky lg:top-[calc(3.5rem+1rem)] lg:self-start'>
            <div className='rounded-lg border bg-card p-4'>{chartColumn}</div>
          </div>
        </div>
      ) : (
        analysisColumn
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
    </>
  );
}
