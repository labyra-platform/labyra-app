/**
 * Strip `$` / `$$` math delimiters around spans that contain Vietnamese letters.
 * @phase R240
 *
 * The model occasionally wraps Vietnamese prose inside math mode, e.g.
 * "$tức là vẽ đồ thị (αhν)^{1/2}$". remarkMath then treats it as math and
 * rehypeKatex renders it as smooshed italic with missing glyphs ("No character
 * metrics for 'ứ'"), which is unreadable.
 *
 * This runs on the raw markdown STRING before react-markdown. The previous
 * approach (remark-unwrap-vi-math, a mdast transformer) is a no-op under
 * react-markdown v10 — its in-place node mutation is not applied in that
 * pipeline — so the guard silently stopped working. A string pre-pass is
 * independent of react-markdown internals and cannot regress on upgrade.
 *
 * Heuristic (same as the old plugin): a math span whose content carries a
 * Vietnamese diacritic is prose, not math. Valid LaTeX/math uses ASCII +
 * symbols only, so an accented Latin letter is a reliable prose signal.
 * Genuine math ($\theta$, $E_g$, $d=\lambda/2\sin\theta$) is left untouched.
 */

// Latin-1 Supplement + Latin Extended-A/B (À-ɏ) + Latin Extended Additional
// (Ạ-ỿ) — covers every precomposed Vietnamese letter. Normalize NFC first so
// model output in decomposed (NFD) form is composed before testing.
const VI_DIACRITIC = /[\u00C0-\u024F\u1E00-\u1EFF]/u;

function hasVietnamese(s: string): boolean {
  return VI_DIACRITIC.test(s.normalize('NFC'));
}

/**
 * Remove math delimiters around Vietnamese-containing spans, keeping the inner
 * text (spaces preserved) so it renders as normal prose. No-op when the string
 * has no `$`.
 */
export function unwrapViMath(md: string): string {
  if (!md.includes('$')) return md;

  // Display math $$...$$ first, so the inline pass below cannot split it.
  let out = md.replace(/\$\$([\s\S]+?)\$\$/g, (full, inner: string) =>
    hasVietnamese(inner) ? inner : full
  );

  // Inline math $...$ — a single `$` (not part of `$$`, not escaped), content
  // on one line. Lookarounds keep real $$display$$ spans out of this pass.
  out = out.replace(/(?<![\\$])\$(?!\$)([^$\n]+?)\$(?!\$)/g, (full, inner: string) =>
    hasVietnamese(inner) ? inner : full
  );

  return out;
}

/**
 * Clean a raw source-chunk excerpt for a readable preview. OCR leaves LaTeX
 * ({WO}_3, $E_g$) and HTML (<sup>[27]</sup>) in the chunk text; rendered as
 * math it collapses whitespace and shows raw markup. Strip it all down to
 * plain, space-preserving text — a source preview needs to be legible, not
 * typeset (the full paper is one click away).
 */
export function cleanExcerpt(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$\$?/g, '')
    .replace(/\\(?:text|mathrm|mathbf|mathit)\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Safety net for when the model forgets to wrap math in $…$ (the prompt asks it
 * to, but it occasionally emits bare LaTeX like "(\alpha h\nu)^{1/2}" or
 * "\(E_g\)", which react-markdown then shows raw). Only touches spans that are
 * unambiguously LaTeX — a backslash-command or a \(…\)/\[…\] delimiter — so
 * ordinary parenthesised prose is never wrapped. Runs BEFORE unwrapViMath.
 */
export function wrapBareLatex(md: string): string {
  const spans: string[] = [];
  const S = '\u0001';
  // Protect existing math so we don't double-wrap.
  let s = md
    .replace(/\$\$[\s\S]+?\$\$/g, (m) => `${S}${spans.push(m) - 1}${S}`)
    .replace(/(?<![\\$])\$(?!\$)[^$\n]+?\$(?!\$)/g, (m) => `${S}${spans.push(m) - 1}${S}`);
  // Explicit LaTeX delimiters → dollar form (remark-math only understands $).
  s = s
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, x: string) => `$$${x}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, x: string) => `$${x}$`);
  // A parenthesised expression containing a LaTeX command, optionally with a
  // trailing power/subscript: (\alpha h\nu)^{1/2}.
  s = s.replace(
    /\([^$()\n]*\\[a-zA-Z]+[^$()\n]*\)(?:\s*[\^_]\{[^}\n]*\}|\s*[\^_][A-Za-z0-9]+)?/g,
    (m) => `$${m}$`
  );
  return s.replace(new RegExp(`${S}(\\d+)${S}`, 'g'), (_, i: string) => spans[Number(i)] ?? '');
}
