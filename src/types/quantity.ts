/**
 * Quantity — a number that carries how precisely it is known (design rules §8).
 *
 * The rule: precision travels with the measurement source and is never decided
 * in the view layer. A band gap of 2.6 eV is not 2.60 eV, and `.toFixed(2)` on
 * a value the worker knows to four decimals throws away two digits the
 * calculation actually produced.
 *
 * ── Why `decimals` and not `sigFigs` ────────────────────────────────────────
 *
 * §8 writes the type with `sigFigs`, but both sources it names constrain
 * *absolute* precision, which significant figures cannot express:
 *
 *   a balance reading 0.0501 g  → 4 decimals, 3 significant figures
 *   the same balance, 12.3456 g → 4 decimals, 6 significant figures
 *
 * One instrument, one readability, two different sigFigs. So sigFigs is not a
 * property of the source — it is a property of each individual reading, and
 * storing it per-source would be wrong for every reading but one. Decimal
 * places are what the balance's readability and QE's output format actually
 * fix. Conflating relative and absolute precision is the same class of error
 * §8 exists to prevent, so the type says what it means.
 *
 * Significant figures still matter, but where they belong: propagating through
 * multiplication and division. That is arithmetic on quantities, and there is
 * none yet — when there is, it goes in a converter, not here.
 */

export type QuantitySource = 'balance' | 'dft' | 'manual';

export type Quantity = {
  value: number;
  unit: string;
  /** Decimal places the source actually resolves. Not a display preference. */
  decimals: number;
  source: QuantitySource;
};

/**
 * Band gap as reported by Quantum ESPRESSO.
 *
 * QE prints `highest occupied, lowest unoccupied level (ev)` with four decimal
 * places, so their difference is known to four — which is exactly what the
 * worker already encodes with `round(lumo_ev - homo_ev, 4)` in
 * qe_parser.py. That rounding *is* the precision decision; it was simply
 * being thrown away instead of carried.
 *
 * Note the SCF convergence threshold is not the limit here, despite §8 naming
 * it: a typical conv_thr of 1e-8 Ry is ~1.4e-7 eV, tighter than the printed
 * digits by six orders of magnitude. The output format binds first.
 */
export function dftBandGap(gapEv: number): Quantity {
  return { value: gapEv, unit: 'eV', decimals: 4, source: 'dft' };
}

/**
 * Render at exactly the precision the source resolves — no more, no less.
 *
 * min = max = decimals is deliberate. Trailing zeros here are measured, not
 * padding: if QE reports homo 5.1200 and lumo 7.8400, the gap is 2.7200 and
 * every one of those digits was resolved. Printing "2.72" would hide that we
 * know the next two are zero, which is the same loss as printing 0.05 for a
 * balance reading of 0.0501.
 */
export function formatQuantity(q: Quantity, locale: string): string {
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: q.decimals,
    maximumFractionDigits: q.decimals
  }).format(q.value);
  return `${n} ${q.unit}`;
}
