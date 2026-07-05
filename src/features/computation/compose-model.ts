/**
 * Composer model — supported DFT pipeline archetypes and the pure builder that
 * turns an archetype + per-node parameters + a structure/global into a
 * launchable workflow JSON ({structure, global, units}).
 *
 * VERIFY-not-TRUST: only calc types the worker can actually run are offered
 * (pw.x / bands.x / dos.x / projwfc.x). Phonon (ph.x) is intentionally absent —
 * the worker has no ph.x executable or dynmat parser, so exposing it would
 * create runs that fail. The param builders mirror serialize.ts / the verified
 * h-WO₃ / 2H-WS₂ runs.
 *
 * @phase R315-composer
 */
import { HEX_BANDS_PATH, type BandsPathPoint } from '@/features/computation/bands-path';
import type { DftCalcType } from '@/types/dft';

export type ParamKey =
  | 'kgrid'
  | 'occupations'
  | 'degauss'
  | 'convThr'
  | 'emin'
  | 'emax'
  | 'deltaE'
  | 'nbnd'
  | 'smearing'
  | 'mixingBeta'
  | 'electronMaxstep'
  | 'restartMode'
  | 'nstep'
  | 'etotConvThr'
  | 'forcConvThr'
  | 'nspin'
  | 'mixingMode'
  | 'diagonalization'
  | 'ionDynamics'
  | 'bfgsNdim'
  | 'cellDynamics'
  | 'press'
  | 'cellDofree'
  | 'nosym'
  | 'totCharge'
  | 'dipoleCorrection'
  | 'edir'
  | 'emaxpos'
  | 'eopreg'
  | 'eamp'
  | 'mixingNdim'
  | 'diagoDavidNdim'
  | 'diagoFullAcc'
  | 'avgNpt'
  | 'avgIdir'
  | 'avgAwin';

export type SmearingType = 'gaussian' | 'methfessel-paxton' | 'marzari-vanderbilt' | 'fermi-dirac';

export type RestartMode = 'from_scratch' | 'restart';
export type MixingMode = 'plain' | 'TF' | 'local-TF';
export type Diagonalization = 'david' | 'cg' | 'ppcg' | 'rmm-davidson';
export type IonDynamics = 'bfgs' | 'damp' | 'fire';
export type CellDynamics = 'bfgs' | 'sd' | 'damp-pr';
export type CellDofree = 'all' | 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | '2Dxy' | 'shape' | 'volume';

export interface NodeParams {
  kgrid: [number, number, number];
  occupations: 'fixed' | 'smearing';
  degauss: number;
  convThr: number;
  emin: number;
  emax: number;
  deltaE: number;
  // advanced (all verified against the worker pw.in.j2 template)
  nbnd: number;
  smearing: SmearingType;
  mixingBeta: number;
  electronMaxstep: number;
  // &CONTROL
  restartMode: RestartMode;
  nstep: number; // 0 = QE default
  etotConvThr: number; // 0 = QE default (relax/vc-relax)
  forcConvThr: number; // 0 = QE default (relax/vc-relax)
  // &SYSTEM
  nspin: 1 | 2;
  // &ELECTRONS
  mixingMode: MixingMode;
  diagonalization: Diagonalization;
  // &IONS (relax / vc-relax)
  ionDynamics: IonDynamics;
  bfgsNdim: number; // 0 = QE default
  // &CELL (vc-relax)
  cellDynamics: CellDynamics;
  press: number; // kbar
  cellDofree: CellDofree;
  // advanced — emit-off (written to the .in only when set / enabled)
  nosym: boolean;
  totCharge: number;
  dipoleCorrection: boolean; // master toggle → tefield+dipfield (+edir/emaxpos/eopreg/eamp)
  edir: number; // 1 | 2 | 3
  emaxpos: number;
  eopreg: number;
  eamp: number; // Hartree a.u.
  mixingNdim: number;
  diagoDavidNdim: number;
  diagoFullAcc: boolean;
  // average.x — planar/macroscopic average of a pp.x filplot (band alignment)
  avgNpt: number;
  avgIdir: 1 | 2 | 3;
  avgAwin: number; // a.u.; 0 = planar average only
}

export interface ComposeNode {
  id: string;
  calcType: DftCalcType;
  dependsOn: string[];
  params: NodeParams;
  flavor?: string;
  kpath?: BandsPathPoint[];
}

export interface Archetype {
  id: string;
  labelKey: string;
  /** Ordered (calcType, deps-by-id) skeleton; params filled with defaults. */
  skeleton: { id: string; calcType: DftCalcType; dependsOn: string[] }[];
}

export interface SerializedUnit {
  id: string;
  calcType: string;
  dependsOn: string[];
  params: Record<string, unknown>;
}
export interface ComposedWorkflow {
  structure: unknown;
  global: unknown;
  units: SerializedUnit[];
}

export const DEFAULT_PARAMS: NodeParams = {
  kgrid: [6, 6, 6],
  occupations: 'fixed',
  degauss: 0.007,
  convThr: 1e-8,
  emin: 0,
  emax: 20,
  deltaE: 0.01,
  nbnd: 0,
  smearing: 'gaussian',
  mixingBeta: 0.2,
  electronMaxstep: 0,
  restartMode: 'from_scratch',
  nstep: 0,
  etotConvThr: 0,
  forcConvThr: 0,
  nspin: 1,
  mixingMode: 'plain',
  diagonalization: 'david',
  ionDynamics: 'bfgs',
  bfgsNdim: 0,
  cellDynamics: 'bfgs',
  press: 0,
  cellDofree: 'all',
  nosym: false,
  totCharge: 0,
  dipoleCorrection: false,
  edir: 3,
  emaxpos: 0.5,
  eopreg: 0.1,
  eamp: 0,
  mixingNdim: 20,
  diagoDavidNdim: 8,
  diagoFullAcc: false,
  avgNpt: 2000,
  avgIdir: 3,
  avgAwin: 0
};

/** Which basic params are meaningful (and thus editable) for a calc type. */
export function editableKeys(calcType: DftCalcType): ParamKey[] {
  if (calcType === 'dos' || calcType === 'pdos') return ['emin', 'emax', 'deltaE'];
  if (calcType === 'ppbands') return [];
  if (calcType === 'bands') return ['occupations', 'degauss', 'convThr'];
  if (calcType === 'charge') return [];
  // vc-relax / relax / scf / nscf
  return ['kgrid', 'occupations', 'degauss', 'convThr'];
}

/**
 * Advanced params — only for pw.x calc types (the pw.in.j2 template interpolates
 * nbnd / smearing / mixing_beta / electron_maxstep). Post-processing nodes have
 * none. (npool is NOT here: the worker takes it request-level, not per-unit.)
 */
export function advancedKeys(calcType: DftCalcType): ParamKey[] {
  if (POSTPROC_TYPES.has(calcType)) return [];
  return ['nbnd', 'smearing', 'mixingBeta', 'electronMaxstep'];
}

export interface NamelistBlock {
  name: string;
  keys: ParamKey[];
  advanced?: ParamKey[];
}

/**
 * Group a calc type's editable params into QE input namelists / cards so the
 * editor mirrors the .in structure (R341). Only blocks with content are returned;
 * `bands` reads its k-path from the dedicated editor, so it has no K_POINTS block.
 * All keys here are "core" (always shown) — advanced namelist variables arrive in
 * a later round behind a per-block reveal.
 */
export function paramBlocks(calcType: DftCalcType): NamelistBlock[] {
  if (calcType === 'dos' || calcType === 'pdos') {
    return [{ name: '&DOS', keys: ['emin', 'emax', 'deltaE'] }];
  }
  if (calcType === 'avgpot') {
    return [{ name: 'AVERAGE', keys: ['avgNpt', 'avgIdir', 'avgAwin'] }];
  }
  if (calcType === 'ppbands' || calcType === 'charge') return [];
  const isRelax = calcType === 'relax' || calcType === 'vc-relax';
  const control: ParamKey[] = ['restartMode'];
  if (isRelax) control.push('nstep', 'etotConvThr', 'forcConvThr');
  const blocks: NamelistBlock[] = [
    { name: '&CONTROL', keys: control },
    {
      name: '&SYSTEM',
      keys: ['nspin', 'occupations', 'smearing', 'degauss', 'nbnd'],
      advanced: ['nosym', 'totCharge', 'dipoleCorrection', 'edir', 'emaxpos', 'eopreg', 'eamp']
    },
    {
      name: '&ELECTRONS',
      keys: ['convThr', 'mixingBeta', 'mixingMode', 'diagonalization', 'electronMaxstep'],
      advanced: ['mixingNdim', 'diagoDavidNdim', 'diagoFullAcc']
    }
  ];
  if (isRelax) blocks.push({ name: '&IONS', keys: ['ionDynamics', 'bfgsNdim'] });
  if (calcType === 'vc-relax') {
    blocks.push({ name: '&CELL', keys: ['cellDynamics', 'press', 'cellDofree'] });
  }
  if (calcType !== 'bands') blocks.push({ name: 'K_POINTS', keys: ['kgrid'] });
  return blocks;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'electronic',
    labelKey: 'archElectronic',
    skeleton: [
      { id: 'u1', calcType: 'vc-relax', dependsOn: [] },
      { id: 'u2', calcType: 'scf', dependsOn: ['u1'] },
      { id: 'u3', calcType: 'bands', dependsOn: ['u2'] },
      { id: 'u4', calcType: 'ppbands', dependsOn: ['u3'] },
      { id: 'u5', calcType: 'nscf', dependsOn: ['u2'] },
      { id: 'u6', calcType: 'dos', dependsOn: ['u5'] },
      { id: 'u7', calcType: 'pdos', dependsOn: ['u5'] }
    ]
  }
];

export function nodesFor(archetype: Archetype): ComposeNode[] {
  return archetype.skeleton.map((s) => ({
    ...s,
    flavor: defaultFlavor(s.calcType),
    params: {
      ...DEFAULT_PARAMS,
      ...(s.calcType === 'bands' ? { electronMaxstep: 500 } : {})
    }
  }));
}

const PW_TYPES = new Set<DftCalcType>(['vc-relax', 'relax', 'scf', 'nscf', 'bands']);
const POSTPROC_TYPES = new Set<DftCalcType>(['dos', 'pdos', 'ppbands', 'charge', 'avgpot']);

export interface FlavorOption {
  id: string;
  params: Record<string, unknown>;
}

/**
 * Executable "flavors" (Mat3ra-style sub-modes) for calc types whose executable
 * has real variants: bands.x can extract per-spin bands (spin_component); pp.x
 * selects which 3D quantity to dump via plot_num. Calc types absent here have a
 * single implicit flavor and show no selector.
 */
export const FLAVORS: Partial<Record<DftCalcType, FlavorOption[]>> = {
  ppbands: [
    { id: 'bands', params: {} },
    { id: 'bands_spin_up', params: { spinComponent: 1 } },
    { id: 'bands_spin_dn', params: { spinComponent: 2 } }
  ],
  charge: [
    { id: 'pp_density', params: { plotNum: 0 } },
    { id: 'pp_electrostatic_potential', params: { plotNum: 11 } },
    { id: 'pp_wfn', params: { plotNum: 7, kpoint: 1, kband: 1 } }
  ]
};

export function defaultFlavor(calcType: DftCalcType): string | undefined {
  return FLAVORS[calcType]?.[0]?.id;
}

function flavorParams(calcType: DftCalcType, flavor: string | undefined): Record<string, unknown> {
  const list = FLAVORS[calcType];
  if (!list) return {};
  return (list.find((f) => f.id === flavor) ?? list[0]).params;
}

/** calcType → QE executable (single source of truth for the graph + editor). */
export const EXE_OF: Record<DftCalcType, string> = {
  'vc-relax': 'pw.x',
  relax: 'pw.x',
  scf: 'pw.x',
  nscf: 'pw.x',
  bands: 'pw.x',
  charge: 'pp.x',
  ppbands: 'bands.x',
  dos: 'dos.x',
  pdos: 'projwfc.x',
  avgpot: 'average.x'
};

/** Calc types offered in the node "execute" selector, grouped by executable. */
export const CALC_GROUPS: { exe: string; types: DftCalcType[] }[] = [
  { exe: 'pw.x', types: ['vc-relax', 'relax', 'scf', 'nscf', 'bands'] },
  { exe: 'pp.x', types: ['charge'] },
  { exe: 'bands.x', types: ['ppbands'] },
  { exe: 'dos.x', types: ['dos'] },
  { exe: 'projwfc.x', types: ['pdos'] },
  { exe: 'average.x', types: ['avgpot'] }
];

function buildPwParams(
  calcType: DftCalcType,
  p: NodeParams,
  vdw: { corr: string | null; version: number },
  kpath?: BandsPathPoint[]
): Record<string, unknown> {
  const stress = calcType === 'vc-relax' || calcType === 'scf';
  const params: Record<string, unknown> = {
    calculation: calcType,
    occupations: p.occupations,
    convThr: p.convThr,
    mixingBeta: p.mixingBeta,
    diagoDavidNdim: p.diagoDavidNdim,
    mixingNdim: p.mixingNdim,
    tstress: stress,
    tprnfor: stress,
    restartMode: p.restartMode,
    nspin: p.nspin,
    mixingMode: p.mixingMode,
    diagonalization: p.diagonalization
  };
  if (p.occupations === 'smearing') {
    params.smearing = p.smearing;
    params.degauss = p.degauss;
  }
  if (p.nbnd > 0) params.nbnd = p.nbnd;
  if (p.electronMaxstep > 0) params.electronMaxstep = p.electronMaxstep;
  if (p.nosym) params.nosym = true;
  if (p.totCharge !== 0) params.totCharge = p.totCharge;
  if (p.diagoFullAcc) params.diagoFullAcc = true;
  if (p.dipoleCorrection) {
    params.tefield = true;
    params.dipfield = true;
    params.edir = p.edir;
    params.emaxpos = p.emaxpos;
    params.eopreg = p.eopreg;
    params.eamp = p.eamp;
  }
  if (p.nstep > 0) params.nstep = p.nstep;
  if (calcType === 'relax' || calcType === 'vc-relax') {
    params.ionDynamics = p.ionDynamics;
    if (p.bfgsNdim > 0) params.bfgsNdim = p.bfgsNdim;
    if (p.etotConvThr > 0) params.etotConvThr = p.etotConvThr;
    if (p.forcConvThr > 0) params.forcConvThr = p.forcConvThr;
  }
  if (calcType === 'vc-relax') {
    params.cellDynamics = p.cellDynamics;
    params.press = p.press;
    params.cellDofree = p.cellDofree;
  }
  if (vdw.corr === 'grimme-d3') {
    params.vdwCorr = 'grimme-d3';
    params.dftd3Version = vdw.version;
    params.dftd3Threebody = true;
  }
  if (calcType === 'bands') {
    params.kPoints = { type: 'crystal_b', path: kpath ?? HEX_BANDS_PATH };
  } else {
    params.kPoints = { type: 'automatic', grid: p.kgrid, shift: [0, 0, 0] };
  }
  return params;
}

function buildPostprocParams(
  calcType: DftCalcType,
  p: NodeParams,
  prefix: string,
  flavor: string | undefined
): Record<string, unknown> {
  const fp = flavorParams(calcType, flavor);
  if (calcType === 'ppbands') return { lsym: true, name: `PBE_${prefix}`, ...fp };
  if (calcType === 'charge') return { name: `PBE_${prefix}`, ...fp };
  if (calcType === 'avgpot') {
    // pp.x (charge unit, name PBE_{prefix}) writes filplot charge/{name}_{prefix}.charge
    return {
      filplot: `charge/PBE_${prefix}_${prefix}.charge`,
      npt: p.avgNpt,
      idir: p.avgIdir,
      awin: p.avgAwin,
      name: `PBE_${prefix}`
    };
  }
  return { Emin: p.emin, Emax: p.emax, DeltaE: p.deltaE, ngauss: -1, name: `PBE_${prefix}` };
}

export function buildDefinition(
  nodes: ComposeNode[],
  structure: unknown,
  global: unknown
): ComposedWorkflow {
  const g = (global ?? {}) as {
    prefix?: string;
    hubbard?: unknown[];
    vdwCorr?: string;
    dftd3Version?: number;
  };
  const prefix = String(g.prefix ?? 'material');
  const vdw = { corr: g.vdwCorr ?? null, version: g.dftd3Version ?? 4 };
  const units: SerializedUnit[] = nodes.map((n) => ({
    id: n.id,
    calcType: n.calcType,
    dependsOn: n.dependsOn,
    params: PW_TYPES.has(n.calcType)
      ? buildPwParams(n.calcType, n.params, vdw, n.kpath)
      : POSTPROC_TYPES.has(n.calcType)
        ? buildPostprocParams(n.calcType, n.params, prefix, n.flavor)
        : {}
  }));
  return { structure, global, units };
}

/**
 * Build one unit's QE params exactly as sent to the worker — used by the compose
 * preview so the rendered .in matches what will actually run (the worker preview
 * takes params as-is, so they must be built client-side, flavor included).
 */
export function buildUnitParams(node: ComposeNode, global: unknown): Record<string, unknown> {
  const g = (global ?? {}) as { prefix?: string; vdwCorr?: string; dftd3Version?: number };
  const prefix = String(g.prefix ?? 'material');
  const vdw = { corr: g.vdwCorr ?? null, version: g.dftd3Version ?? 4 };
  if (PW_TYPES.has(node.calcType))
    return buildPwParams(node.calcType, node.params, vdw, node.kpath);
  if (POSTPROC_TYPES.has(node.calcType)) {
    return buildPostprocParams(node.calcType, node.params, prefix, node.flavor);
  }
  return {};
}
