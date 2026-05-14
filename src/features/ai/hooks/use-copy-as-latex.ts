'use client';
/**
 * Hook: intercept copy events, replace rendered math with LaTeX source.
 * KaTeX renders MathML with <annotation encoding="application/x-tex"> containing
 * the original LaTeX source. We extract that on copy and put it in clipboard.
 * @phase R160-ai-5d-3d
 */
import { useEffect, type RefObject } from 'react';

/**
 * Walk a DOM fragment, building text string. KaTeX elements are replaced with
 * their LaTeX source wrapped in $...$ or $$...$$.
 */
function walkNode(node: Node): string {
  // Text node — return as-is
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as Element;
  const classList = el.classList;

  // KaTeX equation root — extract LaTeX source
  if (classList?.contains('katex')) {
    const latex = extractLatexFromKatex(el);
    if (latex) {
      const isDisplay = el.closest('.katex-display') !== null;
      return isDisplay ? `\n$$${latex}$$\n` : `$${latex}$`;
    }
  }

  // Skip the rendered HTML side of katex (.katex-html) to avoid duplicating
  // the equation as garbled characters next to the LaTeX
  if (classList?.contains('katex-html')) {
    return '';
  }

  // Skip the MathML side too (it would be empty text after walking, but explicit)
  if (classList?.contains('katex-mathml')) {
    return '';
  }

  // Skip citation chips (they shouldn't pollute copied text with [N])
  // Actually we keep them since user might want refs in the copy
  // (commented out: if (classList?.contains('citation-chip')) return '';)

  // Block-level: add line break after
  const tag = el.tagName?.toLowerCase() ?? '';
  let trailing = '';
  if (tag === 'br') {
    return '\n';
  }
  if (['p', 'div', 'li'].includes(tag)) {
    trailing = '\n\n';
  } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
    trailing = '\n\n';
  }

  // Recurse children
  let text = '';
  for (const child of Array.from(el.childNodes)) {
    text += walkNode(child);
  }
  return text + trailing;
}

/**
 * Find the LaTeX source on a .katex element via MathML annotation.
 */
function extractLatexFromKatex(katexEl: Element): string | null {
  const annotation = katexEl.querySelector('annotation[encoding="application/x-tex"]');
  if (annotation?.textContent) {
    let latex = annotation.textContent.trim();
    // Strip LaTeX spacing commands Word doesn't understand
    latex = latex
      .replace(/\\!/g, '') // negative thin space
      .replace(/\\,/g, ' ') // thin space → regular space
      .replace(/\\;/g, ' ') // thick space
      .replace(/\\:/g, ' ') // medium space
      .replace(/\\quad/g, ' ') // 1em space
      .replace(/\\qquad/g, '  '); // 2em space
    return latex;
  }
  return null;
}

/**
 * Install copy listener. Only intervenes if selection contains a .katex element,
 * otherwise lets the browser handle the copy normally (preserves text formatting).
 */
export function useCopyAsLatex(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleCopy = (e: ClipboardEvent) => {
      if (process.env.NODE_ENV !== 'production') console.warn('[copy-as-latex] copy event fired');
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return;
      }

      const range = selection.getRangeAt(0);

      // Only intervene if selection overlaps our container
      if (!container.contains(range.commonAncestorContainer)) {
        return;
      }

      // Find .katex elements in DOM that intersect range — DON'T rely on cloneContents
      // (it may not include .katex root when user highlights inner spans only).
      const allKatex = container.querySelectorAll('.katex');
      const intersecting: Element[] = [];
      for (const k of Array.from(allKatex)) {
        if (range.intersectsNode(k)) {
          intersecting.push(k);
        }
      }
      if (process.env.NODE_ENV !== 'production')
        console.warn('[copy-as-latex] intersecting katex:', intersecting.length);
      if (intersecting.length === 0) {
        return;
      }

      // Expand range to fully include each intersecting .katex element
      const expandedRange = range.cloneRange();
      for (const k of intersecting) {
        if (k.contains(expandedRange.startContainer) || k === expandedRange.startContainer) {
          expandedRange.setStartBefore(k);
        }
        if (k.contains(expandedRange.endContainer) || k === expandedRange.endContainer) {
          expandedRange.setEndAfter(k);
        }
      }

      const tempDiv = document.createElement('div');
      tempDiv.appendChild(expandedRange.cloneContents());
      if (process.env.NODE_ENV !== 'production')
        console.warn(
          '[copy-as-latex] expanded katex count:',
          tempDiv.querySelectorAll('.katex').length
        );

      // Build text with LaTeX source for math elements
      const text = walkNode(tempDiv)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!text) return;

      // Override plain text with LaTeX source.
      // Keep HTML clipboard with rendered KaTeX (MathML inside) so Word paste-as-equation works.
      let html = '';
      try {
        const wrapper = document.createElement('div');
        wrapper.appendChild(expandedRange.cloneContents());
        // Strip KaTeX spacing artifacts that Word renders as dotted placeholders.
        // KaTeX renders LaTeX spacing commands (\!, \,, etc) as either <mspace>
        // or <mtext> containing invisible chars (U+2063, U+200B, U+00A0 narrow nbsp).
        wrapper.querySelectorAll('mspace').forEach((el) => el.remove());
        // Remove mtext / mo containing only invisible/whitespace chars
        // (incl. U+2061 FUNCTION APPLICATION emitted after \exp, \sin, etc.)
        const INVISIBLE_ONLY = /^[\s\u00A0\u2000-\u200F\u2060-\u2064\u202F]*$/;
        wrapper.querySelectorAll('mtext, mo').forEach((el) => {
          const t = el.textContent ?? '';
          if (INVISIBLE_ONLY.test(t)) {
            el.remove();
          }
        });
        // Bug 5: Word renders <mo>−</mo> at start of <mrow> as dotted placeholder.
        // Fix: wrap leading minus in mrow with empty mn so Word treats as unary minus.
        wrapper.querySelectorAll('mrow').forEach((mrow) => {
          const firstReal = Array.from(mrow.children).find((c) => {
            const tag = c.tagName.toLowerCase();
            // Skip opening fence parens etc
            return !(tag === 'mo' && c.getAttribute('fence') === 'true');
          });
          if (firstReal?.tagName.toLowerCase() === 'mo') {
            const sign = firstReal.textContent?.trim();
            if (sign === '−' || sign === '-' || sign === '+') {
              // leading minus operator — insert empty mrow before for Word
              const placeholder = document.createElementNS(
                'http://www.w3.org/1998/Math/MathML',
                'mn'
              );
              placeholder.textContent = '\u200B'; // zero-width space (invisible)
              firstReal.parentNode?.insertBefore(placeholder, firstReal);
            }
          }
        });
        html = wrapper.innerHTML;
      } catch {
        html = escapeHtml(text);
      }
      e.preventDefault();
      e.clipboardData?.setData('text/plain', text);
      e.clipboardData?.setData('text/html', html);
    };

    container.addEventListener('copy', handleCopy);
    return () => {
      container.removeEventListener('copy', handleCopy);
    };
  }, [containerRef]);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
