/**
 * Hydrogen Evolution Reaction free-energy analysis via the Computational Hydrogen
 * Electrode (CHE, Nørskov 2004). The descriptor for HER activity is ΔG(H*): an
 * ideal catalyst has ΔG(H*) ≈ 0 (thermoneutral H adsorption).
 *
 *   H⁺ + e⁻  →  H*  →  ½ H₂
 *
 *   ΔE(H*) = [E(slab+nH) − E(slab)] / n − ½ E(H₂)      (per adsorbed H, in eV)
 *   ΔG(H*) = ΔE(H*) + (ΔZPE − TΔS)
 *
 * At the equilibrium potential (U = 0 V vs RHE, pH 0) the CHE sets
 * μ(H⁺) + μ(e⁻) = ½ μ(H₂), so the diagram endpoints are both 0 and only ΔG(H*)
 * matters. The (ΔZPE − TΔS) term for adsorbed H is ~0.24 eV in the common
 * approximation, but it is system-dependent and therefore left editable.
 */

export const RY_TO_EV = 13.605693122994;

/** Standard (ΔZPE − TΔS) correction for adsorbed H at 298.15 K (Nørskov 2005). */
export const DEFAULT_H_CORRECTION_EV = 0.24;

export interface HerInputs {
  /** Clean slab total energy. */
  eSlab: number;
  /** Slab + n adsorbed H total energy. */
  eSlabH: number;
  /** Gas-phase H₂ molecule total energy. */
  eH2: number;
  /** Number of adsorbed H atoms in the E(slab+nH) cell. */
  nH: number;
  /** Unit the three energies are given in. */
  unit: 'Ry' | 'eV';
  /** (ΔZPE − TΔS) correction, in eV. */
  correction: number;
}

export interface HerResult {
  /** Electronic adsorption free energy per H, in eV. */
  deltaEH: number;
  /** ΔG(H*) per H, in eV. */
  deltaGH: number;
  /** |ΔG(H*)| ≤ 0.2 eV → near-thermoneutral, good HER catalyst. */
  nearIdeal: boolean;
  /** Sign of adsorption: too weak (ΔG > 0) or too strong (ΔG < 0). */
  binding: 'weak' | 'strong' | 'optimal';
}

export function computeHer(inp: HerInputs): HerResult | null {
  const { eSlab, eSlabH, eH2, nH, unit, correction } = inp;
  if (
    !Number.isFinite(eSlab) ||
    !Number.isFinite(eSlabH) ||
    !Number.isFinite(eH2) ||
    !Number.isFinite(nH) ||
    nH <= 0 ||
    !Number.isFinite(correction)
  ) {
    return null;
  }
  const k = unit === 'Ry' ? RY_TO_EV : 1;
  const deltaEH = ((eSlabH - eSlab) * k) / nH - 0.5 * (eH2 * k);
  const deltaGH = deltaEH + correction;
  const nearIdeal = Math.abs(deltaGH) <= 0.2;
  const binding: HerResult['binding'] =
    Math.abs(deltaGH) <= 0.1 ? 'optimal' : deltaGH > 0 ? 'weak' : 'strong';
  return { deltaEH, deltaGH, nearIdeal, binding };
}

/** Three free-energy levels of the HER pathway, in eV, for the step diagram. */
export function herDiagramLevels(deltaGH: number): { label: string; g: number }[] {
  return [
    { label: 'H⁺ + e⁻', g: 0 },
    { label: 'H*', g: deltaGH },
    { label: '½ H₂', g: 0 }
  ];
}
