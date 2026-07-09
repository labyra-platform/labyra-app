/**
 * Semiconductor band alignment for a heterojunction. Given each material's
 * valence-band maximum (VBM) and conduction-band minimum (CBM) on a common
 * reference (vacuum level, so edges are negative eV), compute the band offsets
 * and classify the junction:
 *
 *   Type I  (straddling) — one gap sits entirely inside the other.
 *   Type II (staggered)  — both edges step the same way; electrons and holes
 *                          separate to opposite materials → good for PEC.
 *   Type III (broken)    — the gaps don't overlap at all.
 *
 * VBM/CBM come from DFT via a work-function / potential lineup; this tool takes
 * them as input and does the alignment + diagram.
 */

export interface BandMaterial {
  name: string;
  /** Valence-band maximum, eV on the common reference (usually negative). */
  vbm: number;
  /** Conduction-band minimum, eV (> VBM). */
  cbm: number;
}

export type AlignmentType = 'I' | 'II' | 'III';

export interface BandAlignmentResult {
  gapA: number;
  gapB: number;
  /** VBM offset, B − A (eV). */
  deltaEv: number;
  /** CBM offset, B − A (eV). */
  deltaEc: number;
  type: AlignmentType;
}

export function computeBandAlignment(a: BandMaterial, b: BandMaterial): BandAlignmentResult | null {
  if (![a.vbm, a.cbm, b.vbm, b.cbm].every((x) => Number.isFinite(x))) return null;
  if (a.cbm <= a.vbm || b.cbm <= b.vbm) return null; // CBM must be above VBM

  const gapA = a.cbm - a.vbm;
  const gapB = b.cbm - b.vbm;
  const deltaEv = b.vbm - a.vbm;
  const deltaEc = b.cbm - a.cbm;

  let type: AlignmentType;
  if (a.cbm <= b.vbm || b.cbm <= a.vbm) {
    type = 'III';
  } else {
    const aInsideB = a.vbm >= b.vbm && a.cbm <= b.cbm;
    const bInsideA = b.vbm >= a.vbm && b.cbm <= a.cbm;
    type = aInsideB || bInsideA ? 'I' : 'II';
  }

  return { gapA, gapB, deltaEv, deltaEc, type };
}
