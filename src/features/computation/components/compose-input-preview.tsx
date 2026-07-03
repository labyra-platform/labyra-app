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
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ComposeInputPreview({
  calcType,
  structure,
  global,
  params,
  unitId,
  onStatus
}: {
  calcType: string;
  structure: unknown;
  global: unknown;
  params: unknown;
  /** Used for the downloaded filename (e.g. scf.in). */
  unitId?: string;
  /** Bubbles preview state up so launch can warn if an input failed to render. */
  onStatus?: (s: { ok: boolean; error: string | null }) => void;
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
      setText(data.input ?? '');
      onStatus?.({ ok: true, error: null });
    } catch {
      setError(t('composeInputError'));
      onStatus?.({ ok: false, error: t('composeInputError') });
    } finally {
      setLoading(false);
    }
  }

  // Auto-render the real .in when the structure, globals, or this unit's params
  // change — debounced (400 ms) so a burst of edits collapses into one worker
  // call. The manual refresh button remains for an explicit re-render.
  const sig = JSON.stringify({ calcType, global, params });
  useEffect(() => {
    if (!structure) return;
    const id = setTimeout(() => void load(), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure, sig]);

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
