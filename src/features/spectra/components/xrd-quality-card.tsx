/**
 * XRDQualityCard — scan quality + acquisition metadata.
 *
 * @phase R161-xrd-detail
 */
'use client';

import type { XRDQualityMetrics } from '@/types/spectra-analysis';

interface XRDQualityCardProps {
  quality?: XRDQualityMetrics;
  wavelength: number;
  source: string;
  crystallinity?: number | null;
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

export function XRDQualityCard({
  quality,
  wavelength,
  source,
  crystallinity
}: XRDQualityCardProps) {
  if (!quality) return null;
  const [rangeMin, rangeMax] = quality.scan_range_2theta;

  const items = [
    { label: 'Scan range', value: `${fmt(rangeMin, 1)}° – ${fmt(rangeMax, 1)}°` },
    { label: 'Step size', value: `${fmt(quality.step_size_deg, 4)}°` },
    { label: 'Data points', value: quality.data_points.toLocaleString() },
    { label: 'λ effective', value: `${fmt(wavelength, 5)} Å` },
    { label: 'Source', value: source },
    {
      label: 'SNR',
      value: quality.snr ? fmt(quality.snr, 1) : '—'
    },
    {
      label: 'Background',
      value: quality.background_estimate ? fmt(quality.background_estimate, 1) : '—'
    },
    {
      label: 'Smallest FWHM',
      value: quality.smallest_fwhm ? `${fmt(quality.smallest_fwhm, 3)}°` : '—'
    },
    {
      label: 'Crystallinity',
      value:
        crystallinity !== null && crystallinity !== undefined ? `${fmt(crystallinity, 1)}%` : '—'
    }
  ];

  return (
    <div className='rounded-lg border bg-card p-4'>
      <h3 className='mb-3 text-sm font-medium'>Scan Quality & Metadata</h3>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
        {items.map((item) => (
          <div key={item.label} className='space-y-0.5'>
            <div className='text-xs text-muted-foreground'>{item.label}</div>
            <div className='font-mono text-sm'>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
