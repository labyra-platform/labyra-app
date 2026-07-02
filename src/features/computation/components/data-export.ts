/**
 * Data export for computed results — serialize bands / DOS (already fetched
 * client-side) to CSV or JSON and trigger a browser download. Energies are raw
 * eV as returned by the worker; JSON carries fermiEv/gap so any zero-shift can
 * be reproduced.
 *
 * @phase R355-results-data-export
 */
import type { BandsData } from './band-structure-plot';
import type { DosData } from './dos-pdos-panel';

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

/** bands.csv — kdist, band_1..band_N (eV, absolute). One row per k-point. */
export function bandsToCsv(data: BandsData): string {
  const header = ['kdist', ...Array.from({ length: data.nbnd }, (_, b) => `band_${b + 1}_eV`)];
  const lines = [header.join(',')];
  for (let k = 0; k < data.kdist.length; k++) {
    const row = [num(data.kdist[k])];
    for (let b = 0; b < data.nbnd; b++) row.push(num(data.bands[b]?.[k]));
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

/** dos.csv — energy_eV, total, then one column per PDOS projection. */
export function dosToCsv(data: DosData): string {
  const labels = data.pdos.map((p) => p.label.replaceAll(',', ';'));
  const header = ['energy_eV', 'total', ...labels];
  const lines = [header.join(',')];
  for (let i = 0; i < data.energies.length; i++) {
    const row = [num(data.energies[i]), num(data.total?.[i])];
    for (const p of data.pdos) row.push(num(p.dos[i]));
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

export function downloadBandsData(data: BandsData, unitId: string, fmt: 'csv' | 'json') {
  if (fmt === 'csv') {
    downloadText(`bands-${unitId}.csv`, bandsToCsv(data), 'text/csv');
  } else {
    downloadText(`bands-${unitId}.json`, JSON.stringify(data, null, 2), 'application/json');
  }
}

export function downloadDosData(data: DosData, unitId: string, fmt: 'csv' | 'json') {
  if (fmt === 'csv') {
    downloadText(`dos-${unitId}.csv`, dosToCsv(data), 'text/csv');
  } else {
    downloadText(`dos-${unitId}.json`, JSON.stringify(data, null, 2), 'application/json');
  }
}
