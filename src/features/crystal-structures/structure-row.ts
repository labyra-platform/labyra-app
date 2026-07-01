/**
 * Crystal-structure view-model — derives the Mat3ra-style table columns from a
 * stored DftStructure. Pure (no React, no server-only): the space group comes
 * from the worker (symmetry analysis); formula, unit-cell formula and lattice
 * family are computed here from the cell so the row is a single source of truth.
 *
 * @phase R318-crystal-structures
 */
import type { CrystalStructure } from '@/types/crystal-structure';
import type { DftStructure } from '@/types/dft';

export interface StructureRow {
  id: string;
  name: string;
  formula: string;
  unitCellFormula: string;
  lattice: string;
  spaceGroup: string;
  nat: number;
  source: string;
  verified: boolean;
}

/** QE ibrav → Bravais family (matches the Mat3ra "Lattice" column granularity). */
const LATTICE_BY_IBRAV: Record<number, string> = {
  0: 'FREE',
  1: 'CUB',
  2: 'CUB',
  3: 'CUB',
  4: 'HEX',
  5: 'RHL',
  6: 'TET',
  7: 'TET',
  8: 'ORC',
  9: 'ORC',
  10: 'ORC',
  11: 'ORC',
  12: 'MCL',
  13: 'MCL',
  14: 'TRI'
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Element → count, ordered by atomicSpecies (falls back to first-seen order). */
function counts(s: DftStructure): [string, number][] {
  const pos = s.atomicPositions ?? [];
  const species = s.atomicSpecies ?? [];
  const order =
    species.length > 0 ? species.map((sp) => sp.element) : [...new Set(pos.map((p) => p.element))];
  return order.map((el) => [el, pos.filter((p) => p.element === el).length]);
}

export function unitCellFormula(s: DftStructure): string {
  return counts(s)
    .map(([el, n]) => (n === 1 ? el : `${el}${n}`))
    .join(' ');
}

export function reducedFormula(s: DftStructure): string {
  const c = counts(s).filter(([, n]) => n > 0);
  if (c.length === 0) return '—';
  const g = c.reduce((acc, [, n]) => gcd(acc, n), 0) || 1;
  return c
    .map(([el, n]) => {
      const r = n / g;
      return r === 1 ? el : `${el}${r}`;
    })
    .join('');
}

export function latticeFamily(ibrav: number): string {
  return LATTICE_BY_IBRAV[ibrav] ?? '—';
}

export function toStructureRow(cs: CrystalStructure): StructureRow {
  const s = cs.structure;
  return {
    id: cs.id,
    name: cs.name,
    formula: reducedFormula(s),
    unitCellFormula: unitCellFormula(s),
    lattice: latticeFamily(s.ibrav),
    spaceGroup: s.spaceGroup ?? '—',
    nat: s.nat,
    source: cs.source,
    verified: cs.verified ?? false
  };
}
