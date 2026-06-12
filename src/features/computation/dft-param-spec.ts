/**
 * DFT parameter classification + baseline (report DFT §4.4).
 *
 * Risk groups: A = constraint (physical correctness), B = advanced tuning,
 * C = fixed (set by calc type), D = quality (convergence — baseline-tracked).
 * Baselines are the project ground truth (nAM-validated); the UI flags params
 * below baseline (✓ at/better, ⚠ modestly worse, ⛔ far worse) WITHOUT blocking.
 *
 * @phase R256-dft-param-baseline
 */

export type ParamGroup = 'A' | 'B' | 'C' | 'D';

export interface ParamSpec {
  group: ParamGroup;
  /** QE field name as shown. */
  label: string;
  /** Ground-truth threshold for D params. */
  baseline?: number;
  /** Direction toward higher quality (for the baseline check). */
  betterWhen?: 'higher' | 'lower';
}

export const DFT_PARAM_SPEC: Record<string, ParamSpec> = {
  // A — constraint (physical correctness)
  occupations: { group: 'A', label: 'occupations' },
  smearing: { group: 'A', label: 'smearing' },
  degauss: { group: 'A', label: 'degauss' },
  vdwCorr: { group: 'A', label: 'vdw_corr' },
  dftd3Version: { group: 'A', label: 'dftd3_version' },
  dftd3Threebody: { group: 'A', label: 'dftd3_threebody' },
  cellDofree: { group: 'A', label: 'cell_dofree' },
  // D — quality (convergence, baseline-tracked)
  convThr: { group: 'D', label: 'conv_thr', baseline: 1e-8, betterWhen: 'lower' },
  nbnd: { group: 'D', label: 'nbnd' },
  Emin: { group: 'D', label: 'Emin' },
  Emax: { group: 'D', label: 'Emax' },
  DeltaE: { group: 'D', label: 'DeltaE', baseline: 0.01, betterWhen: 'lower' },
  // B — advanced tuning
  electronMaxstep: { group: 'B', label: 'electron_maxstep' },
  diagoDavidNdim: { group: 'B', label: 'diago_david_ndim' },
  tstress: { group: 'B', label: 'tstress' },
  tprnfor: { group: 'B', label: 'tprnfor' },
  sampleBias: { group: 'B', label: 'sample_bias' },
  ngauss: { group: 'B', label: 'ngauss' },
  lsym: { group: 'B', label: 'lsym' },
  // C — fixed (set by calc type / pipeline)
  calculation: { group: 'C', label: 'calculation' },
  ionDynamics: { group: 'C', label: 'ion_dynamics' },
  cellDynamics: { group: 'C', label: 'cell_dynamics' },
  plotNum: { group: 'C', label: 'plot_num' },
  iflag: { group: 'C', label: 'iflag' },
  outputFormat: { group: 'C', label: 'output_format' },
  name: { group: 'C', label: 'name' }
};

export type BaselineStatus = 'ok' | 'warn' | 'bad';

/** Compare a value to its baseline. null = no baseline / not comparable. */
export function baselineStatus(key: string, value: unknown): BaselineStatus | null {
  const spec = DFT_PARAM_SPEC[key];
  if (!spec || spec.baseline == null || typeof value !== 'number') return null;
  const ratio = value / spec.baseline;
  if (spec.betterWhen === 'lower') {
    if (value <= spec.baseline) return 'ok';
    return ratio <= 10 ? 'warn' : 'bad';
  }
  if (value >= spec.baseline) return 'ok';
  return ratio >= 0.5 ? 'warn' : 'bad';
}

export function paramGroupOf(key: string): ParamGroup {
  return DFT_PARAM_SPEC[key]?.group ?? 'B';
}
