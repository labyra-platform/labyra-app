/**
 * R572: reconstruct chemical/POM formulae from a PDF text selection.
 *
 * `Selection.toString()` reads the pdf.js text layer in DOM order and returns a
 * flat string. pdf.js builds that layer from positioned text fragments, not
 * from meaning: a subscript is a separate <span> placed lower and smaller, and
 * toString() has no idea that "18" sits under "W". So a formula like
 * H3W18O56(IO6)]6- comes back with every sub/superscript flattened onto the
 * baseline, which is what Nam saw — the highlight selects the right region, but
 * the stored text is wrong.
 *
 * This rebuilds the string from the geometry the fragments carry. Each fragment
 * that intersects the selection contributes its rect; comparing a fragment's
 * vertical centre and height against the line's baseline tells us whether it is
 * a subscript (lower, smaller), a superscript (higher, smaller) or ordinary
 * text. We emit `<sub>...</sub>` / `<sup>...</sup>` around the runs, in strict left-to-right,
 * top-to-bottom order rather than DOM order.
 *
 * This does not guess semantics. It measures position, the same signal a reader
 * uses. What it cannot fully guarantee is nesting depth in something like
 * [M6(O2)6(OH)6(γ-SiW10O36)3]18- — the sub/superscript detection is per
 * fragment and correct, but a bracket group nested three deep is beyond what
 * flat geometry encodes. For those, worker-side OCR (which sees layout) remains
 * the source of truth; this is the best a browser selection can do, and it is a
 * large step past toString().
 */

export interface FormulaFragment {
  text: string;
  /** Viewport rect of this fragment (px), from getBoundingClientRect. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type Role = 'base' | 'sub' | 'super';

interface Line {
  frags: FormulaFragment[];
  baselineTop: number;
  baselineBottom: number;
  medianHeight: number;
}

function height(f: FormulaFragment): number {
  return f.bottom - f.top;
}

function centre(f: FormulaFragment): number {
  return (f.top + f.bottom) / 2;
}

/**
 * Group fragments into visual lines. A fragment joins the current line if its
 * vertical centre is within the line's baseline band; the band is the baseline
 * fragments' extent, not the tallest, so a superscript does not stretch it.
 */
function groupLines(frags: FormulaFragment[]): Line[] {
  const sorted = frags.toSorted((a, b) => centre(a) - centre(b) || a.left - b.left);
  const lines: Line[] = [];

  for (const f of sorted) {
    const last = lines.at(-1);
    if (last) {
      const band = (last.baselineBottom - last.baselineTop) * 0.5 + last.medianHeight * 0.5;
      const lineCentre = (last.baselineTop + last.baselineBottom) / 2;
      if (Math.abs(centre(f) - lineCentre) <= band) {
        last.frags.push(f);
        recomputeBaseline(last);
        continue;
      }
    }
    lines.push({
      frags: [f],
      baselineTop: f.top,
      baselineBottom: f.bottom,
      medianHeight: height(f)
    });
  }
  return lines;
}

/**
 * The baseline of a line is defined by its *tallest* fragments — body text —
 * not by subscripts. Recompute from the fragments whose height is at or above
 * the line's median, so sub/superscripts already added do not drag it.
 */
function recomputeBaseline(line: Line): void {
  const heights = line.frags.map(height).toSorted((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 0;
  const body = line.frags.filter((f) => height(f) >= median * 0.85);
  const src = body.length > 0 ? body : line.frags;
  line.baselineTop = Math.min(...src.map((f) => f.top));
  line.baselineBottom = Math.max(...src.map((f) => f.bottom));
  line.medianHeight = median;
}

/**
 * Classify one fragment against its line. Subscript: centre sits clearly below
 * the baseline centre and the fragment is smaller. Superscript: clearly above
 * and smaller. Everything else is base text. The thresholds are fractions of
 * the line's body height, so they scale with font size.
 */
function classify(f: FormulaFragment, line: Line): Role {
  const bodyCentre = (line.baselineTop + line.baselineBottom) / 2;
  const bodyHeight = line.baselineBottom - line.baselineTop || 1;
  const offset = centre(f) - bodyCentre; // + is lower on screen (down)
  const smaller = height(f) <= bodyHeight * 0.82;
  const shift = bodyHeight * 0.16;

  if (smaller && offset > shift) return 'sub';
  if (smaller && offset < -shift) return 'super';
  return 'base';
}

/**
 * Rebuild a formula string from the fragments of a selection.
 *
 * Fragments arrive unordered; this sorts them into lines, orders each line
 * left-to-right, classifies every fragment by position, and wraps sub/super
 * runs. Adjacent fragments of the same role are merged so "18" does not become
 * "_{1}_{8}". Lines are joined with a space.
 */
export function reconstructFormula(frags: FormulaFragment[]): string {
  if (frags.length === 0) return '';
  const lines = groupLines(frags);
  const out: string[] = [];

  for (const line of lines) {
    recomputeBaseline(line);
    const ordered = line.frags.toSorted((a, b) => a.left - b.left);

    let acc = '';
    let runRole: Role = 'base';
    let run = '';

    const flush = () => {
      if (run === '') return;
      // Emit <sub>/<sup>, which the existing formatSciText already turns into
      // Unicode subscripts for display (it decodes JATS titles the same way).
      // Reusing that path means the reader renders H<sub>3</sub> as H₃ with no
      // second formatter, and a raw copy still reads sensibly.
      if (runRole === 'sub') acc += `<sub>${run}</sub>`;
      else if (runRole === 'super') acc += `<sup>${run}</sup>`;
      else acc += run;
      run = '';
    };

    let prevRight: number | null = null;
    for (const f of ordered) {
      const role = classify(f, line);
      if (role !== runRole) {
        flush();
        runRole = role;
      }
      // Restore inter-word spaces. toString() keeps them; rebuilding from
      // fragments drops them, so infer one from a horizontal gap wider than a
      // fraction of the fragment height (roughly a space's width). Only between
      // base-role fragments — a gap before a subscript is not a word break.
      if (
        prevRight !== null &&
        role === 'base' &&
        runRole === 'base' &&
        f.left - prevRight > height(f) * 0.25 &&
        run !== '' &&
        !run.endsWith(' ')
      ) {
        run += ' ';
      }
      run += f.text;
      prevRight = f.right;
    }
    flush();
    out.push(acc);
  }

  return out.join(' ').replace(/\s+/g, ' ').trim();
}
