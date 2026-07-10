/**
 * ComposeInputPreview — renders the exact QE .in for the selected composer node
 * via /api/dft/preview (worker pw.in.j2 / postproc generator). Shown above the
 * parameter editor so the user sees the real input; the refresh button re-renders
 * after parameter edits (a 1-char QE error fails the whole job, so verify first).
 *
 * @phase R336-compose-input-preview
 */
'use client';

import {
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconLoader2,
  IconRefresh
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/** In-session cache of rendered .in text, keyed by structure+global+params+calc. */
const previewCache = new Map<string, string>();

/** Insert a comment above ATOMIC_POSITIONS noting that the coordinates shown are
 * the initial structure and will be replaced at runtime by the upstream relax. */
function withRelaxMarker(
  input: string,
  upstreamRelax: string | null | undefined,
  t: (k: string, v?: Record<string, string>) => string
): string {
  if (!upstreamRelax || !input.includes('ATOMIC_POSITIONS')) return input;
  const note = `! ${t('previewRelaxNote1', { unit: upstreamRelax })}\n! ${t('previewRelaxNote2')}\n`;
  return input.replace(/^(ATOMIC_POSITIONS)/m, `${note}$1`);
}

export function ComposeInputPreview({
  calcType,
  structure,
  global,
  params,
  unitId,
  onStatus,
  upstreamRelax,
  headerAction
}: {
  calcType: string;
  structure: unknown;
  global: unknown;
  params: unknown;
  /** Used for the downloaded filename (e.g. scf.in). */
  unitId?: string;
  /** Bubbles preview state up so launch can warn if an input failed to render. */
  onStatus?: (s: { ok: boolean; error: string | null }) => void;
  /** If set, this unit's ATOMIC_POSITIONS are replaced at runtime by the relaxed
   * output of this upstream relax/vc-relax unit — a marker is shown in the preview. */
  upstreamRelax?: string | null;
  /** Rendered in the header before the download button (e.g. a preset control). */
  headerAction?: ReactNode;
}) {
  const t = useTranslations('computation');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!structure) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dft/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calcType, structure, global, params })
      });
      const data = (await res.json().catch(() => ({}))) as { input?: string; error?: string };
      if (!res.ok) {
        const msg = data.error ?? t('composeInputError');
        setError(msg);
        onStatus?.({ ok: false, error: msg });
        return;
      }
      const rendered = withRelaxMarker(data.input ?? '', upstreamRelax, t);
      previewCache.set(cacheKey, rendered);
      setText(rendered);
      onStatus?.({ ok: true, error: null });
    } catch {
      setError(t('composeInputError'));
      onStatus?.({ ok: false, error: t('composeInputError') });
    } finally {
      setLoading(false);
    }
  }

  // Cache rendered inputs by (structure+global+params+calc) so switching between
  // nodes — or back to a node — is instant. On change: if we have a cached render
  // show it immediately (0 ms), otherwise render right away for a node switch and
  // only debounce when the same node's params are being edited rapidly.
  const sig = JSON.stringify({ calcType, global, params });
  const cacheKey = `${calcType}::${JSON.stringify(structure)}::${sig}::${upstreamRelax ?? ''}`;
  const prevKindRef = useRef<string>('');
  useEffect(() => {
    if (!structure) return;
    const cached = previewCache.get(cacheKey);
    if (cached !== undefined) {
      setText(cached);
      onStatus?.({ ok: true, error: null });
      return;
    }
    // No cache: a node switch (calcType/unit changed) renders immediately; a param
    // edit on the same node debounces to collapse keystrokes.
    const switched = prevKindRef.current !== calcType;
    prevKindRef.current = calcType;
    if (switched) {
      void load();
      return;
    }
    const id = setTimeout(() => void load(), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure, cacheKey]);

  function downloadInput() {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${unitId || calcType}.in`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className='rounded-lg border'>
      <div
        className={
          open
            ? 'flex items-center justify-between border-b px-3 py-1.5'
            : 'flex items-center justify-between px-3 py-1.5'
        }
      >
        <button
          type='button'
          onClick={() => setOpen((v) => !v)}
          className='flex items-center gap-1 font-mono text-xs font-medium'
        >
          {open ? (
            <IconChevronDown className='size-3.5' />
          ) : (
            <IconChevronRight className='size-3.5' />
          )}
          {t('composeInputTitle')}
        </button>
        <div className='flex items-center gap-0.5'>
          {headerAction}
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={() => downloadInput()}
            disabled={!text}
            aria-label={t('composeInputDownload')}
          >
            <IconDownload className='size-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={() => void load()}
            disabled={loading || !structure}
            aria-label={t('composeInputRefresh')}
          >
            {loading ? (
              <IconLoader2 className='size-4 animate-spin' />
            ) : (
              <IconRefresh className='size-4' />
            )}
          </Button>
        </div>
      </div>
      {!open ? null : error ? (
        <p className='text-destructive px-3 py-2 text-xs'>{error}</p>
      ) : text ? (
        <pre className='max-h-56 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed'>
          {text}
        </pre>
      ) : (
        <p className='text-muted-foreground px-3 py-2 text-xs'>{t('composeInputEmpty')}</p>
      )}
    </div>
  );
}
