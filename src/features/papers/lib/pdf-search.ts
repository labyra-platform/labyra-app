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

export function citeMarkItem(str: string, phrase: string): string {
  if (!phrase) return escapeHtml(str);
  const ns = normForMatch(str);
  const np = normForMatch(phrase);
  if (ns.length < 4 || np.length < 4) return escapeHtml(str);
  if (np.includes(ns) || ns.includes(np)) {
    return `<mark class="pcm">${escapeHtml(str)}</mark>`;
  }
  return escapeHtml(str);
}
