'use client';

/**
 * Shared answer renderer for Papers — turns the model's Markdown + LaTeX output
 * into HTML for BOTH the on-screen bubble (KaTeX HTML) and the clipboard (KaTeX
 * MathML, which Word / Google Docs convert into native equations on paste).
 *
 * The model emits standard Markdown (**bold**, *italic*, bullet/numbered lists,
 * `code`, # headings) and LaTeX in $…$ / $$…$$ / \(…\) / \[…\] — plus the legacy
 * <math>…</math> / <sub>/<sup>/<b>/<i> tags. All are normalised to <math> then
 * rendered once, so display and copy stay identical.
 *
 * @phase R237an, extended R413
 */
import { renderToString } from 'katex';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Heuristic: does this look like LaTeX math (vs prose accidentally wrapped)? */
function looksLikeMath(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F\s]*$/.test(s) && /[\\^_{}=]/.test(s)) return true;
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀ-Ỹ]/.test(s)) {
    return false;
  }
  return /\\[a-zA-Z]+|[\^_{}]/.test(s);
}

/** Render one formula as MathML for clipboard → Word/Docs native equation. */
function renderMathML(tex: string): string {
  const trimmed = tex.trim();
  if (!looksLikeMath(trimmed)) return escapeHtml(trimmed);
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

/** Render one formula as KaTeX HTML for the on-screen bubble. */
function renderMathHtml(tex: string): string {
  const trimmed = tex.trim();
  if (!looksLikeMath(trimmed)) return `<span class="text-foreground">${escapeHtml(trimmed)}</span>`;
  try {
    return renderToString(trimmed, {
      displayMode: false,
      output: 'html',
      throwOnError: false,
      strict: 'ignore',
      trust: false
    });
  } catch {
    return `<code class="font-mono">${escapeHtml(trimmed)}</code>`;
  }
}

/** Strip a leaked thinking-artifact prefix (stray "thought}", "{thought}", "}"). */
function stripThoughtArtifact(s: string): string {
  return s.replace(/^\s*(?:\{?\s*"?(?:thought|thinking|reasoning)"?\s*[:}\]]+|\}+)\s*/i, '');
}

/** Normalise every LaTeX delimiter style to <math> so one code path handles all.
 *  Order matters: $$ before $, and escaped \$ is left alone. */
function normalizeMath(s: string): string {
  return s
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t: string) => `<math>${t.trim()}</math>`)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t: string) => `<math>${t.trim()}</math>`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t: string) => `<math>${t.trim()}</math>`)
    .replace(/(?<!\\)\$(?!\s)([^$\n]+?)(?<!\\)\$/g, (_, t: string) => `<math>${t.trim()}</math>`);
}

/** Inline Markdown emphasis. Runs on escaped text; math sentinels pass through. */
function inlineMd(s: string): string {
  return s
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<![*\w])\*([^*\n]+?)\*(?!\w)/g, '<em>$1</em>')
    .replace(/(?<![_\w])_([^_\n]+?)_(?!\w)/g, '<em>$1</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');
}

/** Block-level Markdown → HTML: headings, bullet/numbered lists, paragraphs. */
function renderMarkdownBlocks(text: string): string {
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const flushPara = (): void => {
    if (para.length > 0) {
      out.push(`<p>${para.join('<br>')}</p>`);
      para = [];
    }
  };
  const closeList = (): void => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flushPara();
      closeList();
      continue;
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      closeList();
      out.push(`<p><strong>${inlineMd(heading[1])}</strong></p>`);
    } else if (bullet) {
      flushPara();
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${inlineMd(bullet[1])}</li>`);
    } else if (numbered) {
      flushPara();
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${inlineMd(numbered[1])}</li>`);
    } else {
      closeList();
      para.push(inlineMd(line));
    }
  }
  flushPara();
  closeList();
  return out.join('');
}

/** The shared pipeline. `mathAs` picks HTML (bubble) vs MathML (clipboard);
 *  `citeButtons` turns [n] into clickable chips (bubble only). */
export function renderPapersAnswerHtml(
  content: string,
  opts: { mathAs: 'html' | 'mathml'; citeButtons: boolean }
): string {
  const cleaned = normalizeMath(stripThoughtArtifact(content.normalize('NFC')));
  const placeholders: string[] = [];
  const sentinel = '\u0001';
  const withMath = cleaned.replace(/<math>([\s\S]*?)<\/math>/gi, (_, latex: string) => {
    const rendered = opts.mathAs === 'mathml' ? renderMathML(latex) : renderMathHtml(latex);
    return `${sentinel}M${placeholders.push(rendered) - 1}${sentinel}`;
  });
  const escaped = escapeHtml(withMath);
  const withTags = escaped.replace(/&lt;(\/?)(sub|sup|b|i)&gt;/gi, '<$1$2>');
  let html = renderMarkdownBlocks(withTags);
  if (opts.citeButtons) {
    // "[2, 3, 4]" → "[2][3][4]" (one bracket, comma-separated numbers).
    html = html.replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})+)\]/g, (_, grp: string) =>
      grp
        .split(/\s*,\s*/)
        .map((d) => `[${d}]`)
        .join('')
    );
    // "[2], [3]" → "[2][3]" (drop the comma/space between consecutive refs) so
    // the chips sit adjacent instead of "chip, chip, chip".
    html = html.replace(/(\[\d{1,2}\])\s*,?\s*(?=\[\d{1,2}\])/g, '$1');
    html = html.replace(
      /\[(\d{1,2})\]/g,
      (_, n: string) => `<button type="button" data-cite="${n}" class="ask-cite-btn">${n}</button>`
    );
  }
  return html.replace(
    new RegExp(`${sentinel}M(\\d+)${sentinel}`, 'g'),
    (_, n: string) => placeholders[Number.parseInt(n, 10)] ?? ''
  );
}

/** Plain-text fallback: keep LaTeX as $…$ (editable in Overleaf), drop markers. */
function contentToPlainPapers(content: string): string {
  return stripThoughtArtifact(content)
    .replace(/<math>([\s\S]*?)<\/math>/gi, '$$$1$$')
    .replace(/<\/?(sub|sup|b|i)>/gi, '')
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/`([^`]+?)`/g, '$1');
}

/** Copy Papers-formatted content to the clipboard as text/html + text/plain. */
export async function copyPapersRich(content: string): Promise<boolean> {
  const html = renderPapersAnswerHtml(content, { mathAs: 'mathml', citeButtons: false });
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
