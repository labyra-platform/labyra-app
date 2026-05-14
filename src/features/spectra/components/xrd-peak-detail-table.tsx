/**
 * XRDPeakDetailTable — Tier 1+2 per-peak metrics using generic DataTable.
 *
 * @phase R161-xrd-detail
 */
'use client';

import { DataTable, type DataTableColumn } from '@/components/ui-extra/data-table';
import type { XRDPeak } from '@/types/spectra-analysis';

interface XRDPeakDetailTableProps {
  peaks: XRDPeak[];
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

function fmtDivBy(n: number | null | undefined, divisor: number, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n / divisor).toFixed(digits);
}

export function XRDPeakDetailTable({ peaks }: XRDPeakDetailTableProps) {
  const columns: DataTableColumn<XRDPeak & { _idx: number }>[] = [
    {
      key: '_idx',
      header: '#',
      cell: (r) => r._idx + 1,
      sortValue: (r) => r._idx
    },
    {
      key: 'two_theta',
      header: '2θ (°)',
      cell: (r) => <span className='font-mono'>{fmt(r.two_theta, 3)}</span>,
      sortValue: (r) => r.two_theta
    },
    {
      key: 'd_spacing',
      header: 'd (Å)',
      cell: (r) => <span className='font-mono'>{fmt(r.d_spacing, 4)}</span>,
      sortValue: (r) => r.d_spacing ?? null
    },
    {
      key: 'fwhm',
      header: 'FWHM (°)',
      cell: (r) => <span className='font-mono'>{fmt(r.fwhm, 3)}</span>,
      sortValue: (r) => r.fwhm
    },
    {
      key: 'intensity',
      header: 'I (counts)',
      cell: (r) => <span className='font-mono'>{fmt(r.intensity, 1)}</span>,
      sortValue: (r) => r.intensity
    },
    {
      key: 'relative_intensity',
      header: 'I (%)',
      cell: (r) => <span className='font-mono'>{fmt(r.relative_intensity, 1)}</span>,
      sortValue: (r) => r.relative_intensity
    },
    {
      key: 'hkl',
      header: 'hkl',
      cell: (r) => <span className='font-mono'>{r.hkl ?? '—'}</span>,
      sortValue: (r) => r.hkl ?? null
    },
    {
      key: 'crystallite_size_nm',
      header: 'D (nm)',
      cell: (r) => <span className='font-mono'>{fmt(r.crystallite_size_nm, 1)}</span>,
      sortValue: (r) => r.crystallite_size_nm ?? null,
      title: 'Scherrer crystallite size: Kλ/(βcosθ), K=0.9'
    },
    {
      key: 'integral_breadth',
      header: 'β (°)',
      cell: (r) => <span className='font-mono'>{fmt(r.integral_breadth, 3)}</span>,
      sortValue: (r) => r.integral_breadth ?? null,
      title: 'Integral breadth = area/height'
    },
    {
      key: 'dislocation_density',
      header: 'δ (×10¹⁵)',
      cell: (r) => <span className='font-mono'>{fmtDivBy(r.dislocation_density, 1e15, 2)}</span>,
      sortValue: (r) => r.dislocation_density ?? null,
      title: 'Dislocation density × 10¹⁵ lines/m² = 1/D²'
    },
    {
      key: 'microstrain',
      header: 'ε (×10⁻³)',
      cell: (r) => <span className='font-mono'>{fmtDivBy(r.microstrain, 1e-3, 2)}</span>,
      sortValue: (r) => r.microstrain ?? null,
      title: 'Microstrain × 10⁻³ = βcosθ/4'
    }
  ];

  const rowsWithIdx = peaks.map((p, idx) => ({ ...p, _idx: idx }));

  return (
    <DataTable
      title='Peak Details'
      description={`${peaks.length} peaks total. Click column headers to sort.`}
      rows={rowsWithIdx}
      columns={columns}
      defaultSort={{ key: 'two_theta', direction: 'asc' }}
      rowKey={(r) => `${r.two_theta}-${r._idx}`}
      footer='D = Scherrer crystallite size (Kλ/βcosθ, K=0.9). β = integral breadth. δ = 1/D² dislocation density. ε = βcosθ/4 microstrain.'
      emptyMessage='No peaks detected.'
      exportFilename='xrd-peak-details'
    />
  );
}
