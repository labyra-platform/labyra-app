/**
 * MultiCitationsPanel — Display FTIR/Raman/UV-Vis citation candidates from
 * internal reference library, matched against user peaks.
 *
 * For each candidate (sorted by match_score desc):
 *   - Header: phase name + formula + score badge
 *   - Table: ref position | intensity | assignment | matched user peak
 *
 * @phase R163-spectra-4c-5c1
 */
'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { SciText } from '@/features/spectra/utils/format-units';
import type {
  MultiCitationCandidate,
  FTIRCitationCandidate,
  RamanCitationCandidate,
  UVVisCitationCandidate,
  FTIRPeak,
  RamanPeak,
  UVVisPeak
} from '@/types/spectra-analysis';

interface MultiCitationsPanelProps {
  candidates: MultiCitationCandidate[];
  userPeaks: FTIRPeak[] | RamanPeak[] | UVVisPeak[];
}

function getUnit(c: MultiCitationCandidate): string {
  switch (c.spectrumType) {
    case 'xrd':
      return '°';
    case 'ftir':
      return 'cm⁻¹';
    case 'raman':
      return 'cm⁻¹';
    case 'uvvis':
      return 'nm';
  }
}

function getRefPosition(c: MultiCitationCandidate, idx: number): number {
  if (c.spectrumType === 'ftir')
    return (c as FTIRCitationCandidate).reference_peaks[idx]?.wavenumber ?? 0;
  if (c.spectrumType === 'raman')
    return (c as RamanCitationCandidate).reference_peaks[idx]?.shift ?? 0;
  if (c.spectrumType === 'uvvis')
    return (c as UVVisCitationCandidate).reference_peaks[idx]?.wavelength ?? 0;
  return 0; // XRD handled by XRDPhaseSummary
}

function getUserPosition(
  c: MultiCitationCandidate,
  userPeak: FTIRPeak | RamanPeak | UVVisPeak
): number {
  if (c.spectrumType === 'ftir') return (userPeak as FTIRPeak).wavenumber_cm1;
  if (c.spectrumType === 'raman') return (userPeak as RamanPeak).shift_cm1;
  if (c.spectrumType === 'uvvis') return (userPeak as UVVisPeak).wavelength_nm;
  return 0;
}

function getRefPeaks(
  c: MultiCitationCandidate
): Array<{ position: number; intensity: number; assignment: string | null }> {
  if (c.spectrumType === 'ftir') {
    return (c as FTIRCitationCandidate).reference_peaks.map((p) => ({
      position: p.wavenumber,
      intensity: p.intensity,
      assignment: p.assignment
    }));
  }
  if (c.spectrumType === 'raman') {
    return (c as RamanCitationCandidate).reference_peaks.map((p) => ({
      position: p.shift,
      intensity: p.intensity,
      assignment: p.assignment
    }));
  }
  if (c.spectrumType === 'uvvis') {
    return (c as UVVisCitationCandidate).reference_peaks.map((p) => ({
      position: p.wavelength,
      intensity: p.intensity,
      assignment: p.assignment
    }));
  }
  return [];
}

export function MultiCitationsPanel({ candidates, userPeaks }: MultiCitationsPanelProps) {
  const t = useTranslations('spectra');

  // Filter out XRD candidates (rendered by XRDPhaseSummary instead)
  const nonXRD = candidates.filter((c) => c.spectrumType !== 'xrd');
  if (nonXRD.length === 0) return null;

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h3 className='text-base font-semibold'>
          {t.has('referenceMatches') ? t('referenceMatches') : 'Reference matches'}
        </h3>
        <span className='text-xs text-muted-foreground'>
          {nonXRD.length} {nonXRD.length === 1 ? 'match' : 'matches'}
        </span>
      </div>

      {nonXRD.map((c, ci) => {
        const unit = getUnit(c);
        const refPeaks = getRefPeaks(c);
        const scorePct = Math.round(c.match_score * 100);
        const scoreVariant: 'default' | 'secondary' | 'outline' =
          scorePct >= 70 ? 'default' : scorePct >= 50 ? 'secondary' : 'outline';

        return (
          <div key={`${c.citation.id}-${ci}`} className='rounded-lg border bg-card p-3 space-y-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-medium'>
                <SciText>{c.citation.title ?? 'Unknown'}</SciText>
              </span>
              {c.formula && (
                <code className='text-xs text-muted-foreground'>
                  <SciText>{c.formula}</SciText>
                </code>
              )}
              <Badge variant={scoreVariant}>{scorePct}% match</Badge>
              <Badge variant='outline' className='text-xs'>
                {c.matched_peaks_count}/{refPeaks.length} peaks
              </Badge>
              <Badge variant='secondary' className='text-xs'>
                internal
              </Badge>
              {c.spectrumType === 'raman' && (c as RamanCitationCandidate).laser_wavelength_nm && (
                <span className='text-xs text-muted-foreground'>
                  λ = {(c as RamanCitationCandidate).laser_wavelength_nm} nm
                </span>
              )}
              {c.spectrumType === 'uvvis' && (c as UVVisCitationCandidate).solvent && (
                <span className='text-xs text-muted-foreground'>
                  in {(c as UVVisCitationCandidate).solvent}
                </span>
              )}
            </div>

            <div className='max-h-64 overflow-y-auto rounded-md border'>
              <table className='w-full text-xs'>
                <thead className='sticky top-0 bg-muted'>
                  <tr>
                    <th className='px-2 py-1 text-left'>Ref ({unit})</th>
                    <th className='px-2 py-1 text-right'>I (%)</th>
                    <th className='px-2 py-1 text-left'>Assignment</th>
                    <th className='px-2 py-1 text-left'>Matched user peak</th>
                  </tr>
                </thead>
                <tbody>
                  {refPeaks.map((rp, i) => {
                    // Find user peak idx that matched this ref peak
                    let matchedUserPos: number | null = null;
                    for (const [userIdxStr, assignment] of Object.entries(c.user_assignment_map)) {
                      if (assignment === rp.assignment) {
                        const userIdx = parseInt(userIdxStr, 10);
                        const up = userPeaks[userIdx];
                        if (up) matchedUserPos = getUserPosition(c, up);
                        break;
                      }
                    }
                    // Fallback: find by position proximity (tolerance from MATCH_TOLERANCE)
                    if (matchedUserPos === null) {
                      const refPos = getRefPosition(c, i);
                      let minDist = Infinity;
                      for (const up of userPeaks) {
                        const userPos = getUserPosition(c, up);
                        const d = Math.abs(userPos - refPos);
                        if (d < minDist) {
                          minDist = d;
                          matchedUserPos = userPos;
                        }
                      }
                      if (minDist > 10) matchedUserPos = null; // too far, treat as unmatched
                    }
                    return (
                      <tr key={i} className='border-t'>
                        <td className='px-2 py-1 font-mono'>{rp.position.toFixed(1)}</td>
                        <td className='px-2 py-1 text-right font-mono'>
                          {rp.intensity.toFixed(0)}
                        </td>
                        <td className='px-2 py-1'>{rp.assignment ?? '—'}</td>
                        <td className='px-2 py-1 font-mono'>
                          {matchedUserPos !== null ? (
                            matchedUserPos.toFixed(1)
                          ) : (
                            <span className='text-muted-foreground'>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
