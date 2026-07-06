/**
 * Math — renders a LaTeX expression with KaTeX. Uses renderToString + an
 * injected span (react-katex has React-19 peer-dependency friction). Inline by
 * default; pass `display` for centered block equations. @phase R394
 */
'use client';

import { renderToString } from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';

export function Math({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false
      });
    } catch {
      return tex;
    }
  }, [tex, display]);

  return (
    <span
      className={display ? 'my-2 block overflow-x-auto' : 'inline'}
      // KaTeX output is trusted (we generate it locally from our own strings).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
