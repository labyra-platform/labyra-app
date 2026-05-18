/**
 * XRDPhaseSummary — detailed per-phase card from citation candidates.
 *
 * For each candidate: formula, space group, lattice params, crystal system,
 * match score, citation chip.
 *
 * @phase R161-phase-summary
 */
'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { SciText } from '@/features/spectra/utils/format-units';
import type { CitationCandidate } from '@/types/spectra-analysis';

interface XRDPhaseSummaryProps {
  candidates: CitationCandidate[];
}

function fmt(n: number | null | undefined, digits = 3): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

function fmtAngle(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(2)}°`;
}

function getCitationLink(c: CitationCandidate): string | null {
  const { source, id, doi, url } = c.citation;
  if (url) return url;
  if (doi) return `https://doi.org/${doi}`;
  if (source === 'COD') return `http://www.crystallography.net/cod/${id}.html`;
  if (source === 'MP') return `https://materialsproject.org/materials/${id}`;
  // R162-spectra-4b — internal reference card detail page
  if (source === 'internal') return `/dashboard/reference-cards/${id}`;
  return null;
}

function confidenceLabel(score: number): { label: string; color: string } {
  if (score >= 0.7)
    return {
      label: 'High',
      color: 'bg-green-500/10 text-green-700 dark:text-green-400'
    };
  if (score >= 0.4)
    return {
      label: 'Medium',
      color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
    };
  return {
    label: 'Low',
    color: 'bg-red-500/10 text-red-700 dark:text-red-400'
  };
}

export function XRDPhaseSummary({ candidates }: XRDPhaseSummaryProps) {
  if (!candidates || candidates.length === 0) return null;

  return (
    <div className='rounded-lg border bg-card'>
      <div className='border-b p-3'>
        <h3 className='text-sm font-medium'>Identified Phases — Detailed</h3>
        <p className='text-xs text-muted-foreground'>
          {candidates.length} candidate{candidates.length > 1 ? 's' : ''} from COD, Materials
          Project, and tenant library. Sorted by match score.
        </p>
      </div>
      <div className='divide-y'>
        {candidates.map((c, i) => {
          const conf = confidenceLabel(c.match_score);
          const link = getCitationLink(c);
          return (
            <div key={`${c.citation.source}-${c.citation.id}-${i}`} className='p-4 space-y-3'>
              {/* R162-internal-ui — branch rendering by source */}
              {/* Header row */}
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='flex items-baseline gap-3'>
                  <span className='text-lg font-semibold'>
                    <SciText>{c.formula}</SciText>
                  </span>
                  {(c.crystal_system || c.space_group) && (
                    <span className='text-xs text-muted-foreground'>
                      {c.crystal_system ?? '—'} · {c.space_group || '—'}
                      {c.space_group_number ? ` (#${c.space_group_number})` : ''}
                    </span>
                  )}
                </div>
                <div className='flex items-center gap-2'>
                  <Badge className={conf.color} variant='secondary'>
                    {conf.label} · {fmt(c.match_score * 100, 1)}%
                  </Badge>
                  <span className='text-xs text-muted-foreground'>
                    {c.matched_peaks_count}/{c.total_user_peaks} peaks
                  </span>
                </div>
              </div>

              {/* Lattice grid — only for CIF-backed sources (COD/MP). Internal cards have peak lists only. */}
              {c.citation.source !== 'internal' && (
                <div className='grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 lg:grid-cols-7 text-xs'>
                  <div>
                    <div className='text-muted-foreground'>a (Å)</div>
                    <div className='font-mono'>{fmt(c.lattice_a, 4)}</div>
                  </div>
                  <div>
                    <div className='text-muted-foreground'>b (Å)</div>
                    <div className='font-mono'>{fmt(c.lattice_b, 4)}</div>
                  </div>
                  <div>
                    <div className='text-muted-foreground'>c (Å)</div>
                    <div className='font-mono'>{fmt(c.lattice_c, 4)}</div>
                  </div>
                  <div>
                    <div className='text-muted-foreground'>α</div>
                    <div className='font-mono'>{fmtAngle(c.lattice_alpha)}</div>
                  </div>
                  <div>
                    <div className='text-muted-foreground'>β</div>
                    <div className='font-mono'>{fmtAngle(c.lattice_beta)}</div>
                  </div>
                  <div>
                    <div className='text-muted-foreground'>γ</div>
                    <div className='font-mono'>{fmtAngle(c.lattice_gamma)}</div>
                  </div>
                  <div>
                    <div className='text-muted-foreground'>Intensity corr.</div>
                    <div className='font-mono'>
                      {c.intensity_correlation !== null ? fmt(c.intensity_correlation, 3) : '—'}
                    </div>
                  </div>
                </div>
              )}

              {/* Peak preview — only for internal source (top 5 by relative_intensity) */}
              {c.citation.source === 'internal' && c.simulated_peaks.length > 0 && (
                <div className='text-xs'>
                  <div className='text-muted-foreground mb-1'>Top peaks (2θ°)</div>
                  <div className='flex flex-wrap gap-2 font-mono'>
                    {c.simulated_peaks
                      .slice()
                      .toSorted((a, b) => b.relative_intensity - a.relative_intensity)
                      .slice(0, 5)
                      .map((p, idx) => (
                        <span key={idx} className='rounded bg-muted px-1.5 py-0.5'>
                          {p.twotheta.toFixed(2)}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Citation */}
              <div className='flex flex-wrap items-center gap-2 pt-1 text-xs'>
                <Badge variant='outline'>
                  {c.citation.source === 'internal'
                    ? `Library · ${c.citation.title ?? c.formula}`
                    : `${c.citation.source} · ${c.citation.id}`}
                </Badge>
                {c.citation.authors && (
                  <span className='text-muted-foreground truncate max-w-md'>
                    {c.citation.authors}
                    {c.citation.year ? ` (${c.citation.year})` : ''}
                  </span>
                )}
                {link &&
                  (c.citation.source === 'internal' ? (
                    <Link href={link} className='ml-auto text-primary hover:underline'>
                      View card →
                    </Link>
                  ) : (
                    <a
                      href={link}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='ml-auto text-primary hover:underline'
                    >
                      View source ↗
                    </a>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
