'use client';

/**
 * SpectrumAnalysisSection — dispatch chart by type (extended).
 * @phase R160-spectra-3c-hotfix3
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { AddReferenceCardDialog } from '@/features/spectra/components/add-reference-card-dialog';
import { AnalysisResultCard } from '@/features/spectra/components/analysis-result-card';
// R163-4c-5c1
import { MultiCitationsPanel } from '@/features/spectra/components/multi-citations-panel';
import { ReferenceCardsManager } from '@/features/spectra/components/reference-cards-manager';
import { FigureStudioModal } from '@/features/spectra/components/figure-studio-modal';
import { type FigureConfig, migrateFigureConfig } from '@/features/spectra/figure-config';
import { getFigureDefinitions } from '@/features/spectra/figure-registry';
import { DSCChart, OCPChart, TGAChart } from '@/features/spectra/components/spectrum-chart-ext';
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
  // R208 Figure Studio (registry): one config per figure on the page, keyed by
  // FigureDefinition.key. Built from the registry once the analysis loads.
  // Configs are serializable (persisted per-figure in R5.4).
  const [figureConfigs, setFigureConfigs] = useState<Record<string, FigureConfig>>({});
  const [activeFigureKey, setActiveFigureKey] = useState<string | null>(null);
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

  // R208: build one config per figure from the registry, once the analysis is
  // known. Technique-agnostic — the registry decides which figures exist and
  // each figure's descriptors + default axis convention.
  const configInitedRef = useRef(false);
  useEffect(() => {
    const p = result?.parsed;
    if (!p || configInitedRef.current) return;
    const defs = getFigureDefinitions(p);
    if (defs.length === 0) return;
    configInitedRef.current = true;
    const next: Record<string, FigureConfig> = {};
    for (const def of defs) {
      next[def.key] = migrateFigureConfig(null, def.descriptors, def.defaultReverseX);
    }
    setFigureConfigs(next);
  }, [result]);

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

  // Reference-card overlays only render on the XRD chart (JCPDS-style phase
  // cards), so the add/manage controls are shown for XRD only — hiding them on
  // FTIR/Raman/UV-Vis where they have no chart effect.
  const canAddReference = parsed.spectrum_type === 'xrd';

  // R208: registry-driven figures — no per-type branching. The registry decides
  // which figures exist; each gets an "Edit figure" button + Studio modal.
  const xrdOverlays = activeCards
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
    }));
  const figureDefs = getFigureDefinitions(parsed, { referenceCards: xrdOverlays });
  const isCharted =
    figureDefs.length > 0 ||
    parsed.spectrum_type === 'tga' ||
    parsed.spectrum_type === 'dsc' ||
    parsed.spectrum_type === 'ocp';

  const chartColumn = (
    <div className='space-y-5'>
      {figureDefs.map((def) => {
        const cfg = figureConfigs[def.key];
        if (!cfg) return null;
        return (
          // Each figure is a self-contained card (Law of Proximity): the label +
          // edit control + chart belong together, the border groups them, and the
          // gap between cards (space-y-5) separates distinct figures.
          <div key={def.key} className='space-y-3 rounded-lg border bg-card p-4'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium'>{def.label}</span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setActiveFigureKey(def.key)}
              >
                <Icons.adjustments className='mr-1.5 size-4' />
                Edit figure
              </Button>
            </div>
            {def.render(cfg)}
          </div>
        );
      })}

      {/* Not yet registered (no Figure Studio) — rendered as-is for now. */}
      {parsed.spectrum_type === 'tga' && (
        <div className='rounded-lg border bg-card p-4'>
          <TGAChart parsed={parsed} />
        </div>
      )}
      {parsed.spectrum_type === 'dsc' && (
        <div className='rounded-lg border bg-card p-4'>
          <DSCChart parsed={parsed} />
        </div>
      )}
      {parsed.spectrum_type === 'ocp' && (
        <div className='rounded-lg border bg-card p-4'>
          <OCPChart parsed={parsed} />
        </div>
      )}
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
            {chartColumn}
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
      {activeFigureKey &&
        (() => {
          const def = figureDefs.find((d) => d.key === activeFigureKey);
          const cfg = figureConfigs[activeFigureKey];
          if (!def || !cfg) return null;
          return (
            <FigureStudioModal
              open
              onOpenChange={(o) => !o && setActiveFigureKey(null)}
              parsed={parsed}
              measurementId={spectrumId}
              config={cfg}
              onConfigChange={(next) =>
                setFigureConfigs((prev) => ({ ...prev, [activeFigureKey]: next }))
              }
              capabilities={def.capabilities}
              renderChart={def.render}
            />
          );
        })()}
    </>
  );
}
