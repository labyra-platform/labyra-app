'use client';

/**
 * Rich-text copy helper for Papers — same idea as src/features/ai/lib/copy-rich
 * but for the Papers content tag set used by the translation panel and Ask AI:
 *   <sub>…</sub> / <sup>…</sup> / <b>…</b> / <i>…</i> / <math>LaTeX</math>
 *
 * Outputs text/html with KaTeX-rendered MathML so equations paste into Word /
 * Google Docs as real equations, alongside a text/plain fallback. The plain
 * fallback strips the tags but keeps the raw LaTeX inside <math> so it's still
 * editable in Overleaf etc.
 *
 * @phase R237an
 */
import { renderToString } from 'katex';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function looksLikeMath(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F\s]*$/.test(s) && /[\\^_{}=]/.test(s)) return true;
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀ-Ỹ]/.test(s)) {
    return false;
  }
  return /\\[a-zA-Z]+|[\^_{}]/.test(s);
}

/** Render one <math> block as MathML for clipboard. Word + Google Docs both
 *  convert MathML into native equations on paste; KaTeX is already a dep. */
function renderMathML(tex: string): string {
  const trimmed = tex.trim();
  if (!looksLikeMath(trimmed)) {
    // Prose accidentally wrapped → fall through as plain text so the paste
    // still reads naturally instead of "[Equation]" with garbage inside.
    return escapeHtml(trimmed);
  }
  try {
    return renderToString(trimmed, {
      displayMode: false,
      output: 'mathml',
      throwOnError: false,
      strict: 'ignore'
    });
  } catch {
    return escapeHtml(trimmed);
  }
}

/** Convert Papers-flavoured tagged content to clean HTML for clipboard.
 *  Pipeline:
 *   (1) Pull every <math> out, render to MathML, replace with sentinel.
 *   (2) HTML-escape everything else (defang any rogue model output).
 *   (3) Re-enable the four formatting tags by un-escaping their brackets.
 *   (4) Split paragraphs on blank lines and lines on single newlines so the
 *       result looks like a normal Word document (paragraphs + <br>).
 *   (5) Swap sentinels for the MathML strings. */
function contentToHtmlPapers(content: string): string {
  const placeholders: string[] = [];
  const sentinel = '\u0001';
  // Capture the char right after </math> so we can decide on spacing: Word glues
  // the following word straight onto an inline equation. We add a trailing space
  // unless the next char is punctuation (, . ; : ) ] etc.) or already a space.
  const withMath = content.replace(
    /<math>([\s\S]*?)<\/math>(\s*)(.?)/gi,
    (_, latex: string, gap: string, nextChar: string) => {
      const idx = placeholders.push(renderMathML(latex)) - 1;
      const needsSpace =
        gap.length === 0 && nextChar.length > 0 && !/[,.;:)\]}!?%»"']/.test(nextChar);
      return `${sentinel}M${idx}${sentinel}${needsSpace ? ' ' : gap}${nextChar}`;
    }
  );

  const escaped = escapeHtml(withMath);
  const inline = escaped.replace(/&lt;(\/?)(sub|sup|b|i)&gt;/gi, '<$1$2>');

  // Paragraphs separated by blank lines, soft line wraps as <br>.
  const paragraphs = inline.split(/\n{2,}/).map(
    (para) =>
      `<p>${para
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('<br>')}</p>`
  );
  const html = paragraphs.join('');

  return html.replace(
    new RegExp(`${sentinel}M(\\d+)${sentinel}`, 'g'),
    (_, n: string) => placeholders[Number.parseInt(n, 10)] ?? ''
  );
}

/** Plain-text fallback: strip the inline tags but keep raw LaTeX inside the
 *  math markers so the user can paste into Overleaf and get editable source. */
function contentToPlainPapers(content: string): string {
  return content
    .replace(/<math>([\s\S]*?)<\/math>/gi, '$$$1$$') // unicode-safe wrap
    .replace(/<\/?(sub|sup|b|i)>/gi, '');
}

/** Copy Papers-formatted content to the clipboard as text/html + text/plain.
 *  Returns true on success; falls back to plain text if ClipboardItem isn't
 *  available (older browsers, insecure contexts). */
export async function copyPapersRich(content: string): Promise<boolean> {
  const html = contentToHtmlPapers(content);
  const plain = contentToPlainPapers(content);
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' })
        })
      ]);
      return true;
    }
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(plain);
      return true;
    } catch {
      return false;
    }
  }
}
