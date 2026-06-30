/**
 * Pure pre-launch sanity-check logic for DFT workflows (no React/worker).
 * Returns ok/warn/error findings on global/structure/units settings that would
 * waste HPC time or fail standard review. @phase R299
 */
import type { DftWorkflow } from '@/types/dft';

export type Severity = 'ok' | 'warn' | 'error';
export interface Check {
  severity: Severity;
  msg: string;
}
export type TFn = (key: string, values?: Record<string, string | number>) => string;

const TRANSITION_METALS = [
  'Ti',
  'V',
  'Cr',
  'Mn',
  'Fe',
  'Co',
  'Ni',
  'Cu',
  'Zn',
  'Zr',
  'Nb',
  'Mo',
  'Tc',
  'Ru',
  'Rh',
  'Pd',
  'Hf',
  'Ta',
  'W',
  'Re',
  'Os',
  'Ir',
  'Pt'
];
const BOHR_TO_ANG = 0.529177;
const SCF_TYPES = ['vc-relax', 'relax', 'scf', 'nscf'];

export function buildChecks(workflow: DftWorkflow, t: TFn): Check[] {
  const checks: Check[] = [];
  const g = workflow.global ?? {};
  const st = workflow.structure;
  const units = workflow.units ?? [];
  const species = st?.atomicSpecies ?? [];
  const elements = species.map((s) => s.element);
  const pseudos = species.map((s) => s.pseudoFile.toLowerCase());

  // 1) ecutrho / ecutwfc ratio (PAW/USPP need ≥ 8, NC ≈ 4)
  if (g.ecutwfc && g.ecutrho) {
    const ratio = g.ecutrho / g.ecutwfc;
    const isPaw = pseudos.some(
      (p) => p.includes('paw') || p.includes('kjpaw') || p.includes('rrkjus') || p.includes('us')
    );
    const minRatio = isPaw ? 8 : 4;
    if (ratio < minRatio) {
      checks.push({
        severity: 'error',
        msg: t('checkEcutRatioLow', { ratio: ratio.toFixed(1), min: minRatio })
      });
    } else {
      checks.push({ severity: 'ok', msg: t('checkEcutRatioOk', { ratio: ratio.toFixed(1) }) });
    }
  } else {
    checks.push({ severity: 'warn', msg: t('checkEcutMissing') });
  }
  if (g.ecutwfc && g.ecutwfc < 30) {
    checks.push({ severity: 'warn', msg: t('checkEcutwfcLow', { v: g.ecutwfc }) });
  }

  // 2) pseudopotential XC ↔ functional
  const func = (g.functional ?? '').toLowerCase();
  if (func && species.length > 0) {
    const want = func === 'pbesol' ? ['pbesol'] : ['pbe'];
    const others = ['pz', 'blyp', 'bp', 'pw91', 'revpbe'].concat(
      func === 'pbesol' ? [] : ['pbesol']
    );
    const mismatched = species.filter((s) => {
      const p = s.pseudoFile.toLowerCase();
      const hasOther = others.some((x) => p.includes(`.${x}-`) || p.includes(`-${x}-`));
      const hasWant = want.some((x) => p.includes(x));
      return hasOther && !hasWant;
    });
    if (mismatched.length > 0) {
      checks.push({
        severity: 'warn',
        msg: t('checkPseudoXcMismatch', {
          files: mismatched.map((s) => s.pseudoFile).join(', '),
          func
        })
      });
    } else {
      checks.push({ severity: 'ok', msg: t('checkPseudoXcOk', { func }) });
    }
  }

  // 3) Hubbard U: manifold element present + TM-oxide without U
  const hub = g.hubbard ?? [];
  if (hub.length > 0) {
    const missing = hub.filter((h) => !elements.includes(h.manifold.split('-')[0]));
    if (missing.length > 0) {
      checks.push({
        severity: 'error',
        msg: t('checkHubbardElemMissing', { manifolds: missing.map((h) => h.manifold).join(', ') })
      });
    } else {
      checks.push({
        severity: 'ok',
        msg: t('checkHubbardOk', {
          manifolds: hub.map((h) => `${h.manifold}=${h.value}`).join(', ')
        })
      });
    }
  } else {
    const hasTM = elements.some((e) => TRANSITION_METALS.includes(e));
    if (hasTM && elements.includes('O')) {
      checks.push({ severity: 'warn', msg: t('checkHubbardMissingOxide') });
    }
  }

  // 4) vdW for 2D units + consistency across scf-type units
  const scfUnits = units.filter((u) => SCF_TYPES.includes(u.calcType));
  const is2D = units.some((u) => (u.params?.cellDofree ?? '').toLowerCase().includes('2d'));
  const withVdw = scfUnits.filter((u) => u.params?.vdwCorr);
  if (is2D) {
    const without = scfUnits.filter((u) => !u.params?.vdwCorr);
    if (without.length > 0) {
      checks.push({
        severity: 'error',
        msg: t('check2dVdwMissing', { units: without.map((u) => u.id).join(', ') })
      });
    } else {
      checks.push({ severity: 'ok', msg: t('check2dVdwOk') });
    }
  } else if (withVdw.length > 0 && withVdw.length < scfUnits.length) {
    const without = scfUnits.filter((u) => !u.params?.vdwCorr);
    checks.push({
      severity: 'warn',
      msg: t('checkVdwInconsistent', { units: without.map((u) => u.id).join(', ') })
    });
  }

  // 5) k-point spacing (ibrav=4 hexagonal: a=celldm1·Bohr, c=a·celldm3)
  const gridUnit =
    scfUnits.find((u) => u.params?.kPoints?.grid) ?? units.find((u) => u.params?.kPoints?.grid);
  const grid = gridUnit?.params?.kPoints?.grid;
  if (grid && st && st.ibrav === 4 && st.celldm?.[1] && st.celldm?.[3]) {
    const aAng = st.celldm[1] * BOHR_TO_ANG;
    const cAng = aAng * st.celldm[3];
    const sAB = 1 / (aAng * grid[0]);
    const sC = 1 / (cAng * grid[2]);
    if (sAB > 0.04 || sC > 0.04) {
      checks.push({
        severity: 'warn',
        msg: t('checkKspacingCoarse', { sab: sAB.toFixed(3), sc: sC.toFixed(3) })
      });
    } else {
      checks.push({
        severity: 'ok',
        msg: t('checkKspacingOk', { sab: sAB.toFixed(3), sc: sC.toFixed(3) })
      });
    }
  } else if (grid && grid.some((n) => n < 2)) {
    checks.push({ severity: 'warn', msg: t('checkKgridCoarse', { grid: grid.join('×') }) });
  }

  // 6) smearing requires degauss > 0
  for (const u of scfUnits) {
    if (u.params?.occupations === 'smearing' && !(u.params?.degauss && u.params.degauss > 0)) {
      checks.push({ severity: 'warn', msg: t('checkSmearingNoDegauss', { unit: u.id }) });
    }
  }

  return checks;
}
