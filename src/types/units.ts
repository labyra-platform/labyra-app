/**
 * Units — design rules §8, the half that isn't formatting.
 *
 * > "Never store a bare number for a physical quantity. Store { value, unit },
 * > convert through one converter, and forbid addition across dimensions.
 * > Without this, 120 mL will eventually be summed with 0.12 L."
 *
 * "Forbid" is done in the type system, not at runtime. A Quantity carries its
 * dimension as a type parameter, so `add(mass, volume)` does not throw — it
 * does not compile. A check that fires in production has already let the wrong
 * number reach a user; a check that fires in the editor has not.
 *
 * ── What gets stored ────────────────────────────────────────────────────────
 *
 * The source's own unit, with its own precision. Not SI.
 *
 * Converting to SI on write would round-trip fine numerically — float64 has
 * room — but it would erase which instrument said what, and that is
 * provenance, not presentation (ADR-016). Quantum ESPRESSO reports a band gap
 * in eV to four decimals; a balance reports grams to four. Rewriting those as
 * 4.3551e-19 J and 1.32e-3 kg keeps the number and throws away the sentence
 * "QE said this". Display preference changes the view. It must never reach the
 * record.
 *
 * ── Constants ───────────────────────────────────────────────────────────────
 *
 * eV is exact: the 2019 SI redefinition fixes e = 1.602176634e-19 C. The
 * Rydberg, Hartree and Bohr values are CODATA 2018. Cross-checked before use:
 * Ha/Ry = 2.000000000000, Ry = 2.179872e-18 J, a0 = 5.291772109e-11 m.
 */

export type Dimension = 'mass' | 'volume' | 'temperature' | 'energy' | 'length';

/**
 * `factor` converts to the dimension's reference unit; `offset` follows it.
 * Only temperature needs an offset, and it is the reason this is not a bare
 * multiplier — see `convert`.
 */
type UnitDef = { factor: number; offset?: number };

const UNITS = {
  mass: {
    kg: { factor: 1e3 },
    g: { factor: 1 },
    mg: { factor: 1e-3 },
    µg: { factor: 1e-6 }
  },
  volume: {
    L: { factor: 1e3 },
    mL: { factor: 1 },
    µL: { factor: 1e-3 }
  },
  temperature: {
    K: { factor: 1, offset: -273.15 },
    '°C': { factor: 1 },
    '°F': { factor: 5 / 9, offset: -32 }
  },
  energy: {
    eV: { factor: 1 },
    Ry: { factor: 13.605693122994 },
    Ha: { factor: 27.211386245988 },
    J: { factor: 1 / 1.602176634e-19 },
    'kJ/mol': { factor: 1 / 96.48533212331 }
  },
  length: {
    m: { factor: 1e10 },
    nm: { factor: 10 },
    Å: { factor: 1 },
    pm: { factor: 1e-2 },
    bohr: { factor: 0.529177210903 }
  }
} as const satisfies Record<Dimension, Record<string, UnitDef>>;

export type Unit<D extends Dimension> = keyof (typeof UNITS)[D] & string;

export const UNIT_OPTIONS: { [D in Dimension]: Unit<D>[] } = {
  mass: ['kg', 'g', 'mg', 'µg'],
  volume: ['L', 'mL', 'µL'],
  temperature: ['K', '°C', '°F'],
  energy: ['eV', 'Ry', 'Ha', 'J', 'kJ/mol'],
  length: ['m', 'nm', 'Å', 'pm', 'bohr']
};

export type QuantitySource = 'balance' | 'dft' | 'instrument' | 'manual';

export type Quantity<D extends Dimension = Dimension> = {
  dimension: D;
  value: number;
  unit: Unit<D>;
  /** Decimal places the source resolves. Absolute precision, not sig figs. */
  decimals: number;
  source: QuantitySource;
  /**
   * Temperature only. A reading of 25 °C is 298.15 K; a *rise* of 25 °C is a
   * rise of 25 K. Same number, same unit, different conversion — the offset
   * applies to points and not to intervals. Getting this wrong turns "the
   * sample warmed by 25 degrees" into "the sample warmed by 298 degrees", and
   * nothing about the stored number reveals which was meant. So it is asked
   * for, not guessed.
   */
  kind?: 'point' | 'interval';
};

function def<D extends Dimension>(dimension: D, unit: Unit<D>): UnitDef {
  return (UNITS[dimension] as Record<string, UnitDef>)[unit];
}

/**
 * Convert within a dimension. Crossing dimensions is a type error, so there is
 * no runtime branch for it.
 *
 * Precision travels with the value. Four decimals in eV is an absolute
 * precision of 1e-4 eV; the same physical precision is 7.3e-6 Ry, which is
 * five decimals there, not four. Carrying `decimals` across unchanged would
 * either invent digits or discard them at every conversion — the two failures
 * §8 is about, arriving through the back door.
 */
export function convert<D extends Dimension>(q: Quantity<D>, to: Unit<D>): Quantity<D> {
  if (q.unit === to) return q;
  const from = def(q.dimension, q.unit);
  const target = def(q.dimension, to);

  const isInterval = q.dimension === 'temperature' && q.kind === 'interval';
  const ref = isInterval ? q.value * from.factor : (q.value + (from.offset ?? 0)) * from.factor;
  const value = isInterval ? ref / target.factor : ref / target.factor - (target.offset ?? 0);

  // The offset shifts where zero is; it does not stretch the scale, so only
  // the factor ratio affects how fine the reading is.
  const precision = 10 ** -q.decimals * (from.factor / target.factor);
  const exact = Math.round(-Math.log10(precision));
  const decimals = Math.max(0, exact);

  // Going to a finer unit than the source resolves, decimal notation runs out
  // of ways to tell the truth: 1.32 g is 1320 mg, and nothing in "1320" says
  // the last zero was never measured — the balance only knew tens of mg. Sig
  // figs exist as a concept precisely because positional notation cannot mark
  // a placeholder. What we can do is refuse to invent the digits we do show,
  // so the value is rounded to the precision it actually has.
  const quantum = 10 ** -exact;
  const shown = exact < 0 ? Math.round(value / quantum) * quantum : value;

  return { ...q, value: shown, unit: to, decimals };
}

/**
 * Same dimension only — the signature is the rule. This is what stops 120 mL
 * from being added to 0.12 L: not a guard, but the absence of a way to ask.
 */
export function add<D extends Dimension>(a: Quantity<D>, b: Quantity<D>): Quantity<D> {
  const rhs = convert(b, a.unit);
  return {
    ...a,
    value: a.value + rhs.value,
    // A sum is no finer than its coarsest term. Reporting 1.2340 g + 0.5 g as
    // 1.7340 g claims three digits the second measurement never had.
    decimals: Math.min(a.decimals, rhs.decimals),
    source: a.source === b.source ? a.source : 'manual'
  };
}

/**
 * Band gap as reported by Quantum ESPRESSO.
 *
 * QE prints `highest occupied, lowest unoccupied level (ev)` to four decimals,
 * so their difference is known to four — which is what the worker already
 * encodes with round(lumo_ev - homo_ev, 4) in qe_parser.py. That rounding is
 * the precision decision; it was being thrown away instead of carried.
 *
 * Note §8 names the SCF convergence threshold as the source of DFT precision.
 * It isn't: a conv_thr of 1e-8 Ry is ~1.4e-7 eV, six orders tighter than the
 * printed digits. The output format binds first.
 */
export function dftBandGap(gapEv: number): Quantity<'energy'> {
  return { dimension: 'energy', value: gapEv, unit: 'eV', decimals: 4, source: 'dft' };
}

/** Numbers pinned to the measurement convention, never the reader's language — see R517. */
const SI_NUMBER_LOCALE = 'en-US';

export function formatQuantity<D extends Dimension>(q: Quantity<D>, unit?: Unit<D>): string {
  const shown = unit ? convert(q, unit) : q;
  const n = new Intl.NumberFormat(SI_NUMBER_LOCALE, {
    minimumFractionDigits: shown.decimals,
    maximumFractionDigits: shown.decimals,
    useGrouping: false
  }).format(shown.value);
  return `${n} ${shown.unit}`;
}
