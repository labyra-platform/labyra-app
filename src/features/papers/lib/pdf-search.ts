/**
 * In-PDF search helpers (Ctrl+F). Pure string utilities used by the reader's
 * find bar + react-pdf customTextRenderer.
 *
 * react-pdf renders a selectable text layer per page; `customTextRenderer`
 * lets us return markup for each text item, so we wrap query matches in
 * <mark class="psm"> (and the active one gets .psm-current via DOM after
 * navigation). Matching is done per text item — a query that straddles two
 * items won't highlight (rare in practice); the match count is derived the same
 * per-item way so the "x / y" readout always equals the number of marks.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Number of (case-folded) occurrences of `query` within one text-item string. */
export function countOccurrences(str: string, query: string, caseSensitive: boolean): number {
  if (!query) return 0;
  const re = new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
  let n = 0;
  while (re.exec(str)) {
    n++;
    // guard against zero-length match loops (query is non-empty here, so this
    // is belt-and-braces).
    if (re.lastIndex === 0) break;
  }
  return n;
}

/** Return HTML for a text item with every match wrapped in <mark class="psm">.
 *  Non-match text is HTML-escaped. With no query, returns the escaped string. */
export function highlightItemClass(
  str: string,
  query: string,
  caseSensitive: boolean,
  className: string
): string {
  if (!query) return escapeHtml(str);
  const re = new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null = re.exec(str);
  while (m) {
    out += escapeHtml(str.slice(last, m.index));
    out += `<mark class="${className}">${escapeHtml(m[0])}</mark>`;
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
    m = re.exec(str);
  }
  out += escapeHtml(str.slice(last));
  return out;
}

/** Ctrl+F search highlight — wraps matches in `<mark class="psm">` (R237be). */
export function highlightItem(str: string, query: string, caseSensitive: boolean): string {
  return highlightItemClass(str, query, caseSensitive, 'psm');
}

/**
 * Citation flash. PDF text items are frequently single words (justified layout),
 * so matching a whole multi-word cited phrase INSIDE one item almost never hits.
 * Instead, light up any item that belongs to the phrase: the item's text sits
 * inside the phrase (word-split layers), or the phrase sits inside a long line
 * item (line-based layers). Matching is normalised (case/punctuation-insensitive)
 * and marks the whole item so the cited region flashes as `<mark class="pcm">`.
 */
function normForMatch(x: string): string {
  return x
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize like normForMatch, but keep the way back.
 *
 * `map[i]` is the index in `x` that produced `norm[i]`, so a span found in the
 * normalized text can be marked in the original — punctuation, casing and
 * runs of whitespace intact.
 */
function normWithMap(x: string): { norm: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let space = false;
  for (let i = 0; i < x.length; i += 1) {
    const ch = x[i];
    if (/[\p{L}\p{N}]/u.test(ch)) {
      out.push(ch.toLowerCase());
      map.push(i);
      space = false;
    } else if (!space && out.length > 0) {
      out.push(' ');
      map.push(i);
      space = true;
    }
  }
  while (out.length > 0 && out[out.length - 1] === ' ') {
    out.pop();
    map.pop();
  }
  return { norm: out.join(''), map };
}

/** Longest suffix of `a` that is also a prefix of `b`. */
function overlapLen(a: string, b: string, min: number): number {
  const max = Math.min(a.length, b.length);
  for (let n = max; n >= min; n -= 1) {
    if (a.endsWith(b.slice(0, n))) return n;
  }
  return 0;
}

/**
 * Mark the part of this text item that the cited phrase actually covers.
 *
 * R540: this used to be all-or-nothing —
 *
 *     if (np.includes(ns) || ns.includes(np)) mark the whole item; else mark nothing
 *
 * PDF.js hands text out in items of roughly a line, so a quote of any length
 * spans several. The items *inside* the quote matched and were marked; the
 * first item starts before the quote and the last runs past its end, so
 * neither was contained either way and neither was marked. The highlight came
 * out clipped at both ends — every time, by construction, and worst on exactly
 * the long quotes that most need checking.
 *
 * The two edge cases are the fix: an item whose tail begins the phrase, and an
 * item whose head finishes it. Both are marked from where the overlap starts
 * to where it ends, which is why the normalized indices have to map back.
 */
export function citeMarkItem(str: string, phrase: string): string {
  if (!phrase) return escapeHtml(str);
  const { norm: ns, map } = normWithMap(str);
  const np = normForMatch(phrase);
  if (ns.length < 4 || np.length < 4) return escapeHtml(str);

  /**
   * Snap to word edges, then wrap.
   *
   * R544: chunk boundaries do not respect words. A chunk beginning "culations
   * involving supercells…" is a real chunk — the chunker cut "calculations" in
   * half — and marking exactly that leaves the reader looking at `ca⟦lculations⟧`
   * and wondering what the highlighter is trying to say. The phrase decides
   * *which* passage; the page decides where its words begin and end.
   */
  const wrap = (rawFrom: number, rawTo: number) => {
    let from = rawFrom;
    let to = rawTo;
    while (from > 0 && /[\p{L}\p{N}]/u.test(str[from - 1])) from -= 1;
    while (to < str.length && /[\p{L}\p{N}]/u.test(str[to])) to += 1;
    return (
      escapeHtml(str.slice(0, from)) +
      `<mark class="pcm">${escapeHtml(str.slice(from, to))}</mark>` +
      escapeHtml(str.slice(to))
    );
  };

  // Whole item lies inside the quote.
  if (np.includes(ns)) return `<mark class="pcm">${escapeHtml(str)}</mark>`;

  // Quote lies inside this item.
  const inner = ns.indexOf(np);
  if (inner !== -1) {
    return wrap(map[inner], (map[inner + np.length - 1] ?? map[map.length - 1]) + 1);
  }

  // Item's tail starts the quote — the first line of the passage.
  const MIN = 8;
  const tail = overlapLen(ns, np, MIN);
  if (tail > 0) return wrap(map[ns.length - tail], str.length);

  // Item's head finishes the quote — the last line of the passage.
  const head = overlapLen(np, ns, MIN);
  if (head > 0) return wrap(0, (map[head - 1] ?? map[map.length - 1]) + 1);

  return escapeHtml(str);
}
