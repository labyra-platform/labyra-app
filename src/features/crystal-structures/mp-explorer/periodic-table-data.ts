/**
 * Periodic-table layout data for the MP Explorer element picker.
 * Each element carries its symbol, grid column (1–18), grid row (1–7 for the
 * main block, 9–10 for the lanthanide/actinide series) and a category used for
 * colour coding. Positions mirror the standard IUPAC table.
 *
 * @phase R325-mp-explorer
 */

export type ElementCategory =
  | 'alkali'
  | 'alkaline'
  | 'transition'
  | 'posttransition'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble'
  | 'lanthanide'
  | 'actinide'
  | 'unknown';

export interface PeriodicElement {
  sym: string;
  col: number;
  row: number;
  category: ElementCategory;
}

/** All 118 elements, positioned for an 18-column CSS grid. */
export const PERIODIC_ELEMENTS: PeriodicElement[] = [
  { sym: 'H', col: 1, row: 1, category: 'nonmetal' },
  { sym: 'He', col: 18, row: 1, category: 'noble' },
  { sym: 'Li', col: 1, row: 2, category: 'alkali' },
  { sym: 'Be', col: 2, row: 2, category: 'alkaline' },
  { sym: 'B', col: 13, row: 2, category: 'metalloid' },
  { sym: 'C', col: 14, row: 2, category: 'nonmetal' },
  { sym: 'N', col: 15, row: 2, category: 'nonmetal' },
  { sym: 'O', col: 16, row: 2, category: 'nonmetal' },
  { sym: 'F', col: 17, row: 2, category: 'halogen' },
  { sym: 'Ne', col: 18, row: 2, category: 'noble' },
  { sym: 'Na', col: 1, row: 3, category: 'alkali' },
  { sym: 'Mg', col: 2, row: 3, category: 'alkaline' },
  { sym: 'Al', col: 13, row: 3, category: 'posttransition' },
  { sym: 'Si', col: 14, row: 3, category: 'metalloid' },
  { sym: 'P', col: 15, row: 3, category: 'nonmetal' },
  { sym: 'S', col: 16, row: 3, category: 'nonmetal' },
  { sym: 'Cl', col: 17, row: 3, category: 'halogen' },
  { sym: 'Ar', col: 18, row: 3, category: 'noble' },
  { sym: 'K', col: 1, row: 4, category: 'alkali' },
  { sym: 'Ca', col: 2, row: 4, category: 'alkaline' },
  { sym: 'Sc', col: 3, row: 4, category: 'transition' },
  { sym: 'Ti', col: 4, row: 4, category: 'transition' },
  { sym: 'V', col: 5, row: 4, category: 'transition' },
  { sym: 'Cr', col: 6, row: 4, category: 'transition' },
  { sym: 'Mn', col: 7, row: 4, category: 'transition' },
  { sym: 'Fe', col: 8, row: 4, category: 'transition' },
  { sym: 'Co', col: 9, row: 4, category: 'transition' },
  { sym: 'Ni', col: 10, row: 4, category: 'transition' },
  { sym: 'Cu', col: 11, row: 4, category: 'transition' },
  { sym: 'Zn', col: 12, row: 4, category: 'transition' },
  { sym: 'Ga', col: 13, row: 4, category: 'posttransition' },
  { sym: 'Ge', col: 14, row: 4, category: 'metalloid' },
  { sym: 'As', col: 15, row: 4, category: 'metalloid' },
  { sym: 'Se', col: 16, row: 4, category: 'nonmetal' },
  { sym: 'Br', col: 17, row: 4, category: 'halogen' },
  { sym: 'Kr', col: 18, row: 4, category: 'noble' },
  { sym: 'Rb', col: 1, row: 5, category: 'alkali' },
  { sym: 'Sr', col: 2, row: 5, category: 'alkaline' },
  { sym: 'Y', col: 3, row: 5, category: 'transition' },
  { sym: 'Zr', col: 4, row: 5, category: 'transition' },
  { sym: 'Nb', col: 5, row: 5, category: 'transition' },
  { sym: 'Mo', col: 6, row: 5, category: 'transition' },
  { sym: 'Tc', col: 7, row: 5, category: 'transition' },
  { sym: 'Ru', col: 8, row: 5, category: 'transition' },
  { sym: 'Rh', col: 9, row: 5, category: 'transition' },
  { sym: 'Pd', col: 10, row: 5, category: 'transition' },
  { sym: 'Ag', col: 11, row: 5, category: 'transition' },
  { sym: 'Cd', col: 12, row: 5, category: 'transition' },
  { sym: 'In', col: 13, row: 5, category: 'posttransition' },
  { sym: 'Sn', col: 14, row: 5, category: 'posttransition' },
  { sym: 'Sb', col: 15, row: 5, category: 'metalloid' },
  { sym: 'Te', col: 16, row: 5, category: 'metalloid' },
  { sym: 'I', col: 17, row: 5, category: 'halogen' },
  { sym: 'Xe', col: 18, row: 5, category: 'noble' },
  { sym: 'Cs', col: 1, row: 6, category: 'alkali' },
  { sym: 'Ba', col: 2, row: 6, category: 'alkaline' },
  { sym: 'Hf', col: 4, row: 6, category: 'transition' },
  { sym: 'Ta', col: 5, row: 6, category: 'transition' },
  { sym: 'W', col: 6, row: 6, category: 'transition' },
  { sym: 'Re', col: 7, row: 6, category: 'transition' },
  { sym: 'Os', col: 8, row: 6, category: 'transition' },
  { sym: 'Ir', col: 9, row: 6, category: 'transition' },
  { sym: 'Pt', col: 10, row: 6, category: 'transition' },
  { sym: 'Au', col: 11, row: 6, category: 'transition' },
  { sym: 'Hg', col: 12, row: 6, category: 'transition' },
  { sym: 'Tl', col: 13, row: 6, category: 'posttransition' },
  { sym: 'Pb', col: 14, row: 6, category: 'posttransition' },
  { sym: 'Bi', col: 15, row: 6, category: 'posttransition' },
  { sym: 'Po', col: 16, row: 6, category: 'metalloid' },
  { sym: 'At', col: 17, row: 6, category: 'halogen' },
  { sym: 'Rn', col: 18, row: 6, category: 'noble' },
  { sym: 'Fr', col: 1, row: 7, category: 'alkali' },
  { sym: 'Ra', col: 2, row: 7, category: 'alkaline' },
  { sym: 'Rf', col: 4, row: 7, category: 'transition' },
  { sym: 'Db', col: 5, row: 7, category: 'transition' },
  { sym: 'Sg', col: 6, row: 7, category: 'transition' },
  { sym: 'Bh', col: 7, row: 7, category: 'transition' },
  { sym: 'Hs', col: 8, row: 7, category: 'transition' },
  { sym: 'Mt', col: 9, row: 7, category: 'transition' },
  { sym: 'Ds', col: 10, row: 7, category: 'transition' },
  { sym: 'Rg', col: 11, row: 7, category: 'transition' },
  { sym: 'Cn', col: 12, row: 7, category: 'transition' },
  { sym: 'Nh', col: 13, row: 7, category: 'posttransition' },
  { sym: 'Fl', col: 14, row: 7, category: 'posttransition' },
  { sym: 'Mc', col: 15, row: 7, category: 'posttransition' },
  { sym: 'Lv', col: 16, row: 7, category: 'posttransition' },
  { sym: 'Ts', col: 17, row: 7, category: 'halogen' },
  { sym: 'Og', col: 18, row: 7, category: 'noble' },
  { sym: 'La', col: 3, row: 9, category: 'lanthanide' },
  { sym: 'Ce', col: 4, row: 9, category: 'lanthanide' },
  { sym: 'Pr', col: 5, row: 9, category: 'lanthanide' },
  { sym: 'Nd', col: 6, row: 9, category: 'lanthanide' },
  { sym: 'Pm', col: 7, row: 9, category: 'lanthanide' },
  { sym: 'Sm', col: 8, row: 9, category: 'lanthanide' },
  { sym: 'Eu', col: 9, row: 9, category: 'lanthanide' },
  { sym: 'Gd', col: 10, row: 9, category: 'lanthanide' },
  { sym: 'Tb', col: 11, row: 9, category: 'lanthanide' },
  { sym: 'Dy', col: 12, row: 9, category: 'lanthanide' },
  { sym: 'Ho', col: 13, row: 9, category: 'lanthanide' },
  { sym: 'Er', col: 14, row: 9, category: 'lanthanide' },
  { sym: 'Tm', col: 15, row: 9, category: 'lanthanide' },
  { sym: 'Yb', col: 16, row: 9, category: 'lanthanide' },
  { sym: 'Lu', col: 17, row: 9, category: 'lanthanide' },
  { sym: 'Ac', col: 3, row: 10, category: 'actinide' },
  { sym: 'Th', col: 4, row: 10, category: 'actinide' },
  { sym: 'Pa', col: 5, row: 10, category: 'actinide' },
  { sym: 'U', col: 6, row: 10, category: 'actinide' },
  { sym: 'Np', col: 7, row: 10, category: 'actinide' },
  { sym: 'Pu', col: 8, row: 10, category: 'actinide' },
  { sym: 'Am', col: 9, row: 10, category: 'actinide' },
  { sym: 'Cm', col: 10, row: 10, category: 'actinide' },
  { sym: 'Bk', col: 11, row: 10, category: 'actinide' },
  { sym: 'Cf', col: 12, row: 10, category: 'actinide' },
  { sym: 'Es', col: 13, row: 10, category: 'actinide' },
  { sym: 'Fm', col: 14, row: 10, category: 'actinide' },
  { sym: 'Md', col: 15, row: 10, category: 'actinide' },
  { sym: 'No', col: 16, row: 10, category: 'actinide' },
  { sym: 'Lr', col: 17, row: 10, category: 'actinide' }
];

/** Non-interactive markers for the La–Lu / Ac–Lr slots in the main block. */
export const PERIODIC_PLACEHOLDERS: {
  label: string;
  col: number;
  row: number;
  category: ElementCategory;
}[] = [
  { label: 'La–Lu', col: 3, row: 6, category: 'lanthanide' },
  { label: 'Ac–Lr', col: 3, row: 7, category: 'actinide' }
];

/** Tailwind classes per category (light tint + readable text, dark-mode aware). */
export const CATEGORY_CLASS: Record<ElementCategory, string> = {
  alkali: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  alkaline: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  transition: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  posttransition: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  metalloid: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  nonmetal: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  halogen: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
  noble: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  lanthanide: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  actinide: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
  unknown: 'bg-muted text-muted-foreground'
};
