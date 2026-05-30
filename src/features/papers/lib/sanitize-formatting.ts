/**
 * Render a translated fragment's inline markup to safe HTML.
 *
 * The translate model emits a tiny tag whitelist (<sub> <sup> <b> <i>) plus
 * <math>LaTeX</math> for equations. This escapes everything, re-enables only
 * those four tags (no attributes), and pre-renders <math> via KaTeX. Used by
 * both the on-page translate panel and the Translations side-panel tab so they
 * render identically (and never show raw "<b>…</b>" / "<sub>3</sub>" text).
 *
 * Extracted from pdf-translate-layer (R237az).
 */
import { renderToString as renderKatex } from 'katex';

function looksLikeMath(raw: string): boolean {
  const s = raw.normalize('NFC');
  // oxlint-disable-next-line no-control-regex
  if (/^[\x00-\x7F\s]*$/.test(s) && /[\\^_{}=]/.test(s)) return true;
  // Accented-Latin ranges (precomposed) + combining marks (NFD safety net):
  // Latin-1/Ext-A/B (À-ɏ), Latin Extended Additional (Vietnamese), and combining
  // diacritics U+0300-036F. Any of these is a strong "prose, not LaTeX" signal.
  if (/[\u00C0-\u024F\u1E00-\u1EFF]/u.test(s)) {
    return false;
  }
  return /\\[a-zA-Z]+|[\^_{}]/.test(s);
}

export function sanitizeFormatting(raw: string): string {
  // Normalize to NFC first so decomposed (NFD) Vietnamese — base letter +
  // combining marks — becomes precomposed, which the math/prose heuristic and
  // the rest of the pipeline handle consistently.
  const normalized = raw.normalize('NFC');
  // Defensive: strip a leaked thinking-artifact prefix (e.g. "thought}").
  const cleaned = normalized.replace(
    /^\s*(?:\{?\s*"?(?:thought|thinking|reasoning)"?\s*[:}\]]+|\}+)\s*/i,
    ''
  );
  const placeholders: string[] = [];
  // \u0001 isn't a character LaTeX or prose will contain, so it's a safe sentinel.
  const sentinel = '\u0001';
  const extracted = cleaned.replace(/<math>([\s\S]*?)<\/math>/gi, (_, latex: string) => {
    const trimmed = latex.trim();
    let html: string;
    if (!looksLikeMath(trimmed)) {
      html = `<span class="text-foreground">${trimmed
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</span>`;
    } else {
      try {
        html = renderKatex(trimmed, {
          throwOnError: false,
          displayMode: false,
          output: 'html',
          strict: 'ignore',
          trust: false
        });
      } catch {
        html = `<code class="font-mono">${trimmed
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</code>`;
      }
    }
    const idx = placeholders.push(html) - 1;
    return `${sentinel}M${idx}${sentinel}`;
  });

  const escaped = extracted.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const whitelisted = escaped.replace(/&lt;(\/?)(sub|sup|b|i)&gt;/gi, '<$1$2>');
  return whitelisted.replace(
    new RegExp(`${sentinel}M(\\d+)${sentinel}`, 'g'),
    (_, n: string) => placeholders[Number.parseInt(n, 10)] ?? ''
  );
}
