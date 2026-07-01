/**
 * Compare-view model — pulls the calibration-relevant scalars from each
 * DftWorkflow (Hubbard U per manifold + band gap + energy) for cross-run
 * comparison. Pure; reads only fields the worker persists.
 *
 * @phase R307-compare-runs
 */
import type { DftWorkflow, HubbardParam } from '@/types/dft';

export interface CompareRow {
  id: string;
  name: string;
  hubbard: HubbardParam[];
  gapEv: number | null;
  direct: boolean | null;
  energyRy: number | null;
  vbmEv: number | null;
  cbmEv: number | null;
  aAng: number | null;
  cAng: number | null;
  volumeAng3: number | null;
  density: number | null;
}

/** Selectable Y-axis metric for the compare chart. */
export type CompareMetric = 'gap' | 'a' | 'c' | 'volume' | 'density' | 'energy';

export interface MetricMeta {
  labelKey: string;
  unit: string;
  decimals: number;
}

export function metricMeta(m: CompareMetric): MetricMeta {
  switch (m) {
    case 'a':
      return { labelKey: 'metricLatticeA', unit: 'Å', decimals: 4 };
    case 'c':
      return { labelKey: 'metricLatticeC', unit: 'Å', decimals: 4 };
    case 'volume':
      return { labelKey: 'metricVolume', unit: 'Å³', decimals: 2 };
    case 'density':
      return { labelKey: 'metricDensity', unit: 'g/cm³', decimals: 3 };
    case 'energy':
      return { labelKey: 'metricEnergy', unit: 'Ry', decimals: 4 };
    default:
      return { labelKey: 'metricGap', unit: 'eV', decimals: 3 };
  }
}

export function metricValue(row: CompareRow, m: CompareMetric): number | null {
  switch (m) {
    case 'a':
      return row.aAng;
    case 'c':
      return row.cAng;
    case 'volume':
      return row.volumeAng3;
    case 'density':
      return row.density;
    case 'energy':
      return row.energyRy;
    default:
      return row.gapEv;
  }
}

export function toCompareRow(wf: DftWorkflow): CompareRow {
  const r = wf.results;
  const rs = r?.relaxedStructure;
  return {
    id: wf.id,
    name: wf.global?.prefix ?? wf.id,
    hubbard: wf.global?.hubbard ?? [],
    gapEv: r?.bandGap?.band_gap_ev ?? r?.scfGap?.gapEv ?? null,
    direct: r?.bandGap?.direct ?? null,
    energyRy: typeof r?.totalEnergyRy === 'number' ? r.totalEnergyRy : null,
    vbmEv: r?.bandGap?.vbm_ev ?? null,
    cbmEv: r?.bandGap?.cbm_ev ?? null,
    aAng: rs?.aAng ?? null,
    cAng: rs?.cAng ?? null,
    volumeAng3: rs?.volumeAng3 ?? null,
    density: rs?.density ?? null
  };
}

/** U value for a manifold in a row, or null when the row lacks it. */
export function uOf(row: CompareRow, manifold: string): number | null {
  return row.hubbard.find((h) => h.manifold === manifold)?.value ?? null;
}

/** All manifolds appearing across rows (sorted, stable). */
export function allManifolds(rows: CompareRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const h of r.hubbard) set.add(h.manifold);
  return [...set].toSorted();
}

/**
 * The single manifold whose U varies across rows (>1 distinct value) — the
 * x-axis of the gap-vs-U calibration curve. Returns null when zero or more than
 * one manifold varies, in which case a per-run bar chart is the honest fallback.
 */
export function variedManifold(rows: CompareRow[]): string | null {
  let found: string | null = null;
  for (const m of allManifolds(rows)) {
    const vals = new Set(rows.map((r) => uOf(r, m)).filter((v): v is number => v != null));
    if (vals.size > 1) {
      if (found != null) return null;
      found = m;
    }
  }
  return found;
}
