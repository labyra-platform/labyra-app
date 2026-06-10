/**
 * Serialize the editor graph into a worker workflow JSON.
 *
 *   edges (source→target)      → unit.dependsOn
 *   node.data.params (inline)  → unit.params (QE shape, matching verified runs)
 *   base template              → structure + global (ecutwfc/ecutrho/functional/prefix/hubbard)
 *
 * Output shape mirrors the verified h-WO3 / 2H-WS2 workflow JSONs.
 *
 * @phase R245-dag-editor-b4-serialize
 */
import type { Edge, Node } from '@xyflow/react';
import { HEX_BANDS_PATH } from '@/features/computation/bands-path';

const PW_TYPES = new Set(['vc-relax', 'scf', 'nscf', 'bands']);
const POSTPROC_TYPES = new Set(['dos', 'pdos', 'ppbands']);

interface SerializedUnit {
  id: string;
  calcType: string;
  dependsOn: string[];
  params: Record<string, unknown>;
}

export interface SerializedWorkflow {
  structure: unknown;
  global: unknown;
  units: SerializedUnit[];
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : fallback;
}

function getParams(node: Node): Record<string, unknown> {
  const data = node.data as { params?: unknown };
  return (data.params as Record<string, unknown> | undefined) ?? {};
}

function getCalcType(node: Node): string {
  return String((node.data as { calcType?: unknown }).calcType ?? '');
}

function buildPwParams(calcType: string, p: Record<string, unknown>): Record<string, unknown> {
  const occupations = String(p.occupations ?? 'fixed');
  const isRelax = calcType === 'vc-relax';
  const stress = isRelax || calcType === 'scf';

  const params: Record<string, unknown> = {
    calculation: calcType,
    occupations,
    convThr: toNumber(p.convThr, 1e-8),
    diagoDavidNdim: toNumber(p.diagoDavidNdim, 8),
    tstress: stress,
    tprnfor: stress
  };

  if (occupations === 'smearing') {
    params.smearing = 'gaussian';
    params.degauss = toNumber(p.degauss, 0.007);
  }
  if (p.nbnd) params.nbnd = toNumber(p.nbnd, 0);
  if (calcType === 'bands') params.electronMaxstep = 500;
  if (p.vdwCorr === 'grimme-d3') {
    params.vdwCorr = 'grimme-d3';
    params.dftd3Version = 3;
    params.dftd3Threebody = true;
  }

  if (calcType === 'bands') {
    params.kPoints = { type: 'crystal_b', path: HEX_BANDS_PATH };
  } else {
    const kgrid = (p.kgrid as number[] | undefined) ?? [6, 6, 6];
    params.kPoints = { type: 'automatic', grid: kgrid, shift: [0, 0, 0] };
  }
  return params;
}

function buildPostprocParams(
  calcType: string,
  p: Record<string, unknown>,
  prefix: string
): Record<string, unknown> {
  if (calcType === 'ppbands') {
    return { lsym: true, name: `PBE_${prefix}` };
  }
  return {
    Emin: toNumber(p.emin, 0),
    Emax: toNumber(p.emax, 20),
    DeltaE: toNumber(p.deltaE, 0.01),
    ngauss: -1,
    name: `PBE_${prefix}`
  };
}

export function serializeWorkflow(
  nodes: Node[],
  edges: Edge[],
  structure: unknown,
  global: { prefix?: string } & Record<string, unknown>
): SerializedWorkflow {
  const depsByTarget = new Map<string, string[]>();
  for (const edge of edges) {
    const deps = depsByTarget.get(edge.target) ?? [];
    deps.push(edge.source);
    depsByTarget.set(edge.target, deps);
  }

  const prefix = String(global.prefix ?? 'material');

  const units: SerializedUnit[] = nodes.map((node) => {
    const calcType = getCalcType(node);
    const p = getParams(node);
    const params = PW_TYPES.has(calcType)
      ? buildPwParams(calcType, p)
      : POSTPROC_TYPES.has(calcType)
        ? buildPostprocParams(calcType, p, prefix)
        : {};
    return {
      id: node.id,
      calcType,
      dependsOn: depsByTarget.get(node.id) ?? [],
      params
    };
  });

  return { structure, global, units };
}
