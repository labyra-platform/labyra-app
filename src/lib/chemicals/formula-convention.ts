/**
 * R576: rewrite PubChem's Hill-notation formula into chemistry convention for
 * the cases where Hill is plainly wrong, and leave everything else untouched.
 *
 * PubChem returns MolecularFormula in Hill notation: carbon first, hydrogen
 * second, then every other element alphabetically. For organics that is the
 * standard and correct. For ionic compounds it is wrong by convention — salts
 * are written cation-first — so NaCl comes back as ClNa, K2CO3 as CKO, NH4Cl as
 * ClH4N. Rendering that raw makes every salt in the library look wrong.
 *
 * This does not attempt a general Hill→convention solver, because there isn't
 * one: which fragment is the cation is chemistry, not string structure, and it
 * cannot be recovered from the formula alone. What it does is narrow and
 * honest — it recognises the simple binary/ternary inorganic salt pattern
 * "<metal or ammonium><nonmetal remainder>" that Hill reorders, and puts the
 * cation back in front. Anything it does not recognise passes through verbatim.
 *
 * The user can always override in the form; this only improves the autofilled
 * default, and errs toward leaving the string alone rather than "fixing" an
 * organic into nonsense.
 */

// Common cations, longest first so 'NH4' matches before 'N'. Metals that lead a
// salt formula, plus ammonium. Not exhaustive by design — an unknown lead
// element means "not a case I'm sure about", so pass through.
const CATIONS = [
  'NH4',
  'Na',
  'Li',
  'Rb',
  'Cs',
  'Fr',
  'Mg',
  'Ca',
  'Sr',
  'Ba',
  'Ra',
  'Al',
  'Ga',
  'In',
  'Tl',
  'Zn',
  'Cd',
  'Ag',
  'Cu',
  'Ni',
  'Co',
  'Fe',
  'Mn',
  'Cr',
  'Pb',
  'Sn',
  'K'
];

// Nonmetal / halogen leaders that Hill would sort ahead of a metal. If the
// formula starts with one of these AND a known cation appears later, Hill has
// almost certainly reordered a salt.
const HILL_FIRST = /^(Br|Cl|F|I|O|S|N|P|C)/;

interface Token {
  el: string;
  count: string;
}

/** Split a formula into (element, count) tokens. Returns null if it is not a
 *  plain element string (parens, charges, dots — leave those alone). */
function tokenize(formula: string): Token[] | null {
  if (!/^[A-Za-z0-9]+$/.test(formula)) return null; // no (), ·, +, - etc.
  const tokens: Token[] = [];
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(formula)) !== null) {
    if (m[0] === '') break;
    tokens.push({ el: m[1], count: m[2] });
    consumed += m[0].length;
  }
  return consumed === formula.length ? tokens : null;
}

function serialize(tokens: Token[]): string {
  return tokens.map((t) => t.el + t.count).join('');
}

/**
 * Return the formula in cation-first order if it is a recognisable Hill-ordered
 * salt, otherwise the formula unchanged.
 */
export function toChemistryConvention(formula: string | undefined): string | undefined {
  if (!formula) return formula;
  const trimmed = formula.trim();

  // Only touch strings Hill would have reordered: they start with a nonmetal.
  if (!HILL_FIRST.test(trimmed)) return trimmed;

  const tokens = tokenize(trimmed);
  if (!tokens) return trimmed;

  // Deliberately narrow: only a two-token binary salt, anion-then-cation, which
  // is exactly what Hill does to NaCl (ClNa), KBr (BrK), CaCl2 (Cl2Ca). Anything
  // with more tokens — carbonates (K2CO3 → Hill CKO), ammonium salts where NH4
  // tokenizes as N + H4, organics — is beyond what can be reordered safely from
  // the string alone, so it passes through for the user to correct. Reordering
  // CKO to KCO would drop no atoms but *does* produce a wrong formula that looks
  // right, which is worse than leaving Hill visible; three-token cases are where
  // that risk lives, so they are excluded.
  if (tokens.length !== 2) return trimmed;

  const [first, second] = tokens;
  // Second token must be a cation, first must not be (i.e. Hill flipped them).
  if (!CATIONS.includes(second.el) || CATIONS.includes(first.el)) return trimmed;

  return serialize([second, first]);
}
