/**
 * RietveldResultCard — full Rietveld refinement output.
 *
 * Displays:
 *  - Convergence + R_wp + chi²
 *  - Profile params (UVW + η + zero shift)
 *  - Per-phase scale + mass fraction + crystallite size
 *  - Notes from refinement
 *
 * @phase R185-10b
 */
'use client';

import { IconChartHistogram } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatFormula } from '@/lib/utils/format-formula';
import { cn } from '@/lib/utils';
import type { RietveldResult } from '@/types/deviation-analysis';

interface RietveldResultCardProps {
  rietveld: RietveldResult;
}

function qualityFromRwp(rwp: number | null | undefined): {
  label: string;
  className: string;
} {
  if (rwp == null) return { label: 'no R-factor', className: 'bg-muted text-muted-foreground' };
  if (rwp < 10)
    return {
      label: 'good fit',
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
    };
  if (rwp < 20)
    return {
      label: 'acceptable',
      className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
    };
  return {
    label: 'poor fit',
    className: 'bg-destructive/10 text-destructive border-destructive/30'
  };
}

export function RietveldResultCard({ rietveld }: RietveldResultCardProps) {
  const quality = qualityFromRwp(rietveld.r_wp);

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <IconChartHistogram className='h-4 w-4' aria-hidden='true' />
          Rietveld refinement
          <Badge variant='outline' className={cn('ml-2 text-xs', quality.className)}>
            {quality.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Convergence + R-factors row */}
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm'>
          <div>
            <p className='text-xs text-muted-foreground'>Converged</p>
            <p className='font-semibold'>{rietveld.converged ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>Iterations</p>
            <p className='font-semibold tabular-nums'>{rietveld.n_iterations}</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>
              R<sub>wp</sub>
            </p>
            <p className='font-semibold tabular-nums'>
              {rietveld.r_wp != null ? `${rietveld.r_wp.toFixed(2)}%` : '—'}
            </p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>χ²</p>
            <p className='font-semibold tabular-nums'>
              {rietveld.chi_squared != null ? rietveld.chi_squared.toFixed(2) : '—'}
            </p>
          </div>
        </div>

        {/* Profile parameters */}
        {rietveld.profile && (
          <div className='bg-muted/40 rounded p-3 space-y-2'>
            <p className='text-xs font-medium text-muted-foreground'>
              Caglioti profile (FWHM² = U·tan²θ + V·tanθ + W) + Pseudo-Voigt
            </p>
            <div className='grid grid-cols-5 gap-2 text-xs font-mono tabular-nums'>
              <div>
                <p className='text-muted-foreground'>U</p>
                <p>{rietveld.profile.U.toFixed(4)}</p>
              </div>
              <div>
                <p className='text-muted-foreground'>V</p>
                <p>{rietveld.profile.V.toFixed(4)}</p>
              </div>
              <div>
                <p className='text-muted-foreground'>W</p>
                <p>{rietveld.profile.W.toFixed(4)}</p>
              </div>
              <div>
                <p className='text-muted-foreground'>η (PV)</p>
                <p>{rietveld.profile.eta.toFixed(2)}</p>
              </div>
              <div>
                <p className='text-muted-foreground'>Δ(2θ)</p>
                <p>{rietveld.profile.zero_shift.toFixed(3)}°</p>
              </div>
            </div>
          </div>
        )}

        {/* Per-phase scales + mass + size */}
        {rietveld.phases.length > 0 && (
          <div className='space-y-2'>
            <p className='text-xs font-medium text-muted-foreground'>Refined phases</p>
            <div className='overflow-x-auto'>
              <table className='w-full text-xs'>
                <thead>
                  <tr className='border-b border-border text-muted-foreground text-left'>
                    <th className='py-2 pr-2 font-medium'>Formula</th>
                    <th className='py-2 px-2 font-medium text-right'>Mass %</th>
                    <th className='py-2 px-2 font-medium text-right'>Size (nm)</th>
                    <th className='py-2 px-2 font-medium text-right'>V (Å³)</th>
                    <th className='py-2 pl-2 font-medium text-right'>Z</th>
                  </tr>
                </thead>
                <tbody>
                  {rietveld.phases.map((p) => (
                    <tr key={p.formula} className='border-b border-border/50 last:border-0'>
                      <td className='py-2 pr-2 font-mono'>{formatFormula(p.formula)}</td>
                      <td className='py-2 px-2 text-right tabular-nums font-medium'>
                        {(p.mass_fraction * 100).toFixed(1)}
                        <span className='text-muted-foreground'>
                          {' ± '}
                          {(p.mass_uncertainty * 100).toFixed(1)}
                        </span>
                      </td>
                      <td className='py-2 px-2 text-right tabular-nums'>
                        {p.crystallite_size_nm != null ? (
                          <>
                            {p.crystallite_size_nm.toFixed(1)}
                            {p.crystallite_size_uncertainty_nm != null && (
                              <span className='text-muted-foreground'>
                                {' ± '}
                                {p.crystallite_size_uncertainty_nm.toFixed(1)}
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className='py-2 px-2 text-right tabular-nums text-muted-foreground'>
                        {p.cell_volume_A3 != null ? p.cell_volume_A3.toFixed(1) : '—'}
                      </td>
                      <td className='py-2 pl-2 text-right tabular-nums text-muted-foreground'>
                        {p.formula_units_per_cell ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Notes */}
        {rietveld.notes.length > 0 && (
          <div className='text-xs text-muted-foreground space-y-1'>
            {rietveld.notes.map((note, i) => (
              <p key={i}>• {note}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
