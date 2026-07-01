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
import { HEX_BANDS_PATH } from '@/features/computation/bands-path';
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
  | 'electronMaxstep';

export type SmearingType = 'gaussian' | 'methfessel-paxton' | 'marzari-vanderbilt' | 'fermi-dirac';

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
}

export interface ComposeNode {
  id: string;
  calcType: DftCalcType;
  dependsOn: string[];
  params: NodeParams;
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
  electronMaxstep: 0
};

/** Which basic params are meaningful (and thus editable) for a calc type. */
export function editableKeys(calcType: DftCalcType): ParamKey[] {
  if (calcType === 'dos' || calcType === 'pdos') return ['emin', 'emax', 'deltaE'];
  if (calcType === 'ppbands') return [];
  if (calcType === 'bands') return ['occupations', 'degauss', 'convThr'];
  // vc-relax / relax / scf / nscf / charge
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
    params: {
      ...DEFAULT_PARAMS,
      ...(s.calcType === 'bands' ? { electronMaxstep: 500 } : {})
    }
  }));
}

const PW_TYPES = new Set<DftCalcType>(['vc-relax', 'relax', 'scf', 'nscf', 'bands', 'charge']);
const POSTPROC_TYPES = new Set<DftCalcType>(['dos', 'pdos', 'ppbands']);

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
  pdos: 'projwfc.x'
};

/** Calc types offered in the node "execute" selector, grouped by executable. */
export const CALC_GROUPS: { exe: string; types: DftCalcType[] }[] = [
  { exe: 'pw.x', types: ['vc-relax', 'relax', 'scf', 'nscf', 'bands'] },
  { exe: 'pp.x', types: ['charge'] },
  { exe: 'bands.x', types: ['ppbands'] },
  { exe: 'dos.x', types: ['dos'] },
  { exe: 'projwfc.x', types: ['pdos'] }
];

function buildPwParams(
  calcType: DftCalcType,
  p: NodeParams,
  hasVdw: boolean
): Record<string, unknown> {
  const stress = calcType === 'vc-relax' || calcType === 'scf';
  const params: Record<string, unknown> = {
    calculation: calcType,
    occupations: p.occupations,
    convThr: p.convThr,
    mixingBeta: p.mixingBeta,
    diagoDavidNdim: 8,
    tstress: stress,
    tprnfor: stress
  };
  if (p.occupations === 'smearing') {
    params.smearing = p.smearing;
    params.degauss = p.degauss;
  }
  if (p.nbnd > 0) params.nbnd = p.nbnd;
  if (p.electronMaxstep > 0) params.electronMaxstep = p.electronMaxstep;
  if (hasVdw) {
    params.vdwCorr = 'grimme-d3';
    params.dftd3Version = 3;
    params.dftd3Threebody = true;
  }
  if (calcType === 'bands') {
    params.kPoints = { type: 'crystal_b', path: HEX_BANDS_PATH };
  } else {
    params.kPoints = { type: 'automatic', grid: p.kgrid, shift: [0, 0, 0] };
  }
  return params;
}

function buildPostprocParams(
  calcType: DftCalcType,
  p: NodeParams,
  prefix: string
): Record<string, unknown> {
  if (calcType === 'ppbands') return { lsym: true, name: `PBE_${prefix}` };
  return { Emin: p.emin, Emax: p.emax, DeltaE: p.deltaE, ngauss: -1, name: `PBE_${prefix}` };
}

export function buildDefinition(
  nodes: ComposeNode[],
  structure: unknown,
  global: unknown
): ComposedWorkflow {
  const g = (global ?? {}) as { prefix?: string; hubbard?: unknown[]; vdwCorr?: string };
  const prefix = String(g.prefix ?? 'material');
  const hasVdw = g.vdwCorr === 'grimme-d3';
  const units: SerializedUnit[] = nodes.map((n) => ({
    id: n.id,
    calcType: n.calcType,
    dependsOn: n.dependsOn,
    params: PW_TYPES.has(n.calcType)
      ? buildPwParams(n.calcType, n.params, hasVdw)
      : POSTPROC_TYPES.has(n.calcType)
        ? buildPostprocParams(n.calcType, n.params, prefix)
        : {}
  }));
  return { structure, global, units };
}
