'use client';

/**
 * Rich-text copy helper (R204): convert an assistant message (markdown + $LaTeX$)
 * into text/html with MathML so pasting into Word / Google Docs preserves
 * formulas as real equations, plus a text/plain fallback.
 *
 * Uses KaTeX (already a dependency) to render math -> MathML. Word and Google
 * Docs read text/html from the clipboard and convert MathML to native equations.
 */
import { renderToString } from 'katex';

/** Render one LaTeX snippet to MathML-bearing HTML (KaTeX). */
function renderMath(tex: string, displayMode: boolean): string {
  try {
    return renderToString(tex, {
      displayMode,
      output: 'mathml',
      throwOnError: false
    });
  } catch {
    // fall back to the raw snippet wrapped so it is at least visible
    return displayMode ? `$$${tex}$$` : `$${tex}$`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Minimal inline-markdown -> HTML for a single text segment (no math here).
 * Handles **bold**, *italic*, `code`. Good enough for chat answers; not a full
 * markdown engine (block structure is handled by line/paragraph splitting).
 */
function inlineMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
}

/**
 * Convert full message content (markdown + $..$ / $$..$$) to HTML.
 * Strategy: split on math delimiters first (so we never markdown-process LaTeX),
 * render math via KaTeX, markdown-process the text spans, rejoin. Paragraphs are
 * separated by blank lines; single newlines become <br>.
 */
export function contentToHtml(content: string): string {
  // Split into math vs text tokens. $$...$$ first, then $...$.
  const tokens: Array<{ type: 'text' | 'math'; value: string; display?: boolean }> = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', value: content.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: 'math', value: m[1], display: true });
    else tokens.push({ type: 'math', value: m[2] ?? '', display: false });
    last = re.lastIndex;
  }
  if (last < content.length) tokens.push({ type: 'text', value: content.slice(last) });

  // Render tokens; for text, preserve paragraph/line breaks + inline markdown.
  const parts = tokens.map((tok) => {
    if (tok.type === 'math') return renderMath(tok.value, tok.display ?? false);
    return tok.value
      .split(/\n{2,}/)
      .map((para) =>
        para
          .split('\n')
          .map((line) => inlineMarkdown(line))
          .join('<br>')
      )
      .join('</p><p>');
  });
  return `<p>${parts.join('')}</p>`;
}

/**
 * Copy a message to clipboard as rich HTML (Word/Docs friendly) + plain fallback.
 * Returns true on success. Falls back to plain-text writeText if ClipboardItem
 * is unavailable.
 */
export async function copyRich(content: string): Promise<boolean> {
  const html = contentToHtml(content);
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([content], { type: 'text/plain' })
      });
      await navigator.clipboard.write([item]);
      return true;
    }
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      return false;
    }
  }
}
