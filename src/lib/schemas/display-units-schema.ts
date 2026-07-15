/**
 * Display units — the user's preferred unit per dimension (design rules §8).
 *
 * These are a *view* setting. Nothing here reaches a record: a mass measured
 * on a balance stays the grams the balance reported, whatever this says. QE
 * reports Ry and VASP reports eV; Labyra converts on the way to the screen and
 * never touches the source file.
 *
 * The enums are built from UNIT_OPTIONS rather than retyped, so a unit added
 * to the system is offered here automatically and a unit removed stops
 * validating — the schema cannot drift from the converter that has to honour
 * it.
 *
 * @phase R523 — units of measure
 */
import { z } from 'zod';
import { UNIT_OPTIONS } from '@/types/units';

function unitEnum<D extends keyof typeof UNIT_OPTIONS>(dimension: D) {
  const opts = UNIT_OPTIONS[dimension] as readonly string[];
  return z.enum(opts as [string, ...string[]]);
}

export const displayUnitsSchema = z.object({
  mass: unitEnum('mass'),
  volume: unitEnum('volume'),
  temperature: unitEnum('temperature'),
  energy: unitEnum('energy'),
  length: unitEnum('length')
});

export type DisplayUnitsInput = z.infer<typeof displayUnitsSchema>;

/**
 * Defaults are what a materials lab writes on a bottle and what a DFT paper
 * prints — grams, millilitres, Celsius, eV, Ångström — not the SI base units.
 * kg and m³ would be correct and useless: nobody weighs a catalyst in
 * kilograms, and a lattice constant in metres is 4e-10.
 */
export const DISPLAY_UNITS_DEFAULTS: DisplayUnitsInput = {
  mass: 'g',
  volume: 'mL',
  temperature: '°C',
  energy: 'eV',
  length: 'Å'
};
