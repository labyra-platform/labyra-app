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
}

export function toCompareRow(wf: DftWorkflow): CompareRow {
  const r = wf.results;
  return {
    id: wf.id,
    name: wf.global?.prefix ?? wf.id,
    hubbard: wf.global?.hubbard ?? [],
    gapEv: r?.bandGap?.band_gap_ev ?? r?.scfGap?.gapEv ?? null,
    direct: r?.bandGap?.direct ?? null,
    energyRy: typeof r?.totalEnergyRy === 'number' ? r.totalEnergyRy : null,
    vbmEv: r?.bandGap?.vbm_ev ?? null,
    cbmEv: r?.bandGap?.cbm_ev ?? null
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
