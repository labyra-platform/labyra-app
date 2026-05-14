/**
 * XRDPeakDetailTable — Tier 1+2 per-peak metrics.
 *
 * Columns: # | 2θ | d (Å) | FWHM (°) | I | Irel% | hkl | D (nm) | β (°) | δ (×10¹⁵) | ε (×10⁻³)
 *
 * @phase R161-xrd-detail
 */
'use client';

import type { XRDPeak } from '@/types/spectra-analysis';

interface XRDPeakDetailTableProps {
  peaks: XRDPeak[];
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

function fmtSci(n: number | null | undefined, divisor = 1, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n / divisor).toFixed(digits);
}

export function XRDPeakDetailTable({ peaks }: XRDPeakDetailTableProps) {
  if (!peaks || peaks.length === 0) {
    return (
      <div className='rounded-md border bg-card p-4 text-sm text-muted-foreground'>
        No peaks detected.
      </div>
    );
  }

  const sortedPeaks = [...peaks].sort((a, b) => a.two_theta - b.two_theta);

  return (
    <div className='rounded-lg border bg-card'>
      <div className='border-b p-3'>
        <h3 className='text-sm font-medium'>Peak Details</h3>
        <p className='text-xs text-muted-foreground'>
          Sorted by 2θ ascending. {peaks.length} peaks total.
        </p>
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead className='bg-muted/50'>
            <tr>
              <th className='px-2 py-2 text-left font-medium'>#</th>
              <th className='px-2 py-2 text-left font-medium'>2θ (°)</th>
              <th className='px-2 py-2 text-left font-medium'>d (Å)</th>
              <th className='px-2 py-2 text-left font-medium'>FWHM (°)</th>
              <th className='px-2 py-2 text-left font-medium'>I (counts)</th>
              <th className='px-2 py-2 text-left font-medium'>I (%)</th>
              <th className='px-2 py-2 text-left font-medium'>hkl</th>
              <th className='px-2 py-2 text-left font-medium'>D (nm)</th>
              <th className='px-2 py-2 text-left font-medium'>β (°)</th>
              <th
                className='px-2 py-2 text-left font-medium'
                title='Dislocation density × 10¹⁵ lines/m²'
              >
                δ (×10¹⁵)
              </th>
              <th className='px-2 py-2 text-left font-medium' title='Microstrain × 10⁻³'>
                ε (×10⁻³)
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPeaks.map((p, i) => (
              <tr key={`${p.two_theta}-${i}`} className='border-t hover:bg-muted/30'>
                <td className='px-2 py-1.5'>{i + 1}</td>
                <td className='px-2 py-1.5 font-mono'>{fmt(p.two_theta, 3)}</td>
                <td className='px-2 py-1.5 font-mono'>{fmt(p.d_spacing, 4)}</td>
                <td className='px-2 py-1.5 font-mono'>{fmt(p.fwhm, 3)}</td>
                <td className='px-2 py-1.5 font-mono'>{fmt(p.intensity, 1)}</td>
                <td className='px-2 py-1.5 font-mono'>{fmt(p.relative_intensity, 1)}</td>
                <td className='px-2 py-1.5 font-mono'>{p.hkl ?? '—'}</td>
                <td className='px-2 py-1.5 font-mono'>{fmt(p.crystallite_size_nm, 1)}</td>
                <td className='px-2 py-1.5 font-mono'>{fmt(p.integral_breadth, 3)}</td>
                <td className='px-2 py-1.5 font-mono'>{fmtSci(p.dislocation_density, 1e15, 2)}</td>
                <td className='px-2 py-1.5 font-mono'>{fmtSci(p.microstrain, 1e-3, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='border-t bg-muted/30 p-2 text-[10px] text-muted-foreground'>
        D = Scherrer crystallite size (Kλ/βcosθ, K=0.9). β = integral breadth. δ = 1/D² dislocation
        density. ε = βcosθ/4 microstrain.
      </div>
    </div>
  );
}
