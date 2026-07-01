/**
 * ComposeInputPreview — renders the exact QE .in for the selected composer node
 * via /api/dft/preview (worker pw.in.j2 / postproc generator). Shown above the
 * parameter editor so the user sees the real input; the refresh button re-renders
 * after parameter edits (a 1-char QE error fails the whole job, so verify first).
 *
 * @phase R336-compose-input-preview
 */
'use client';

import { IconLoader2, IconRefresh } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ComposeInputPreview({
  calcType,
  structure,
  global,
  params
}: {
  calcType: string;
  structure: unknown;
  global: unknown;
  params: unknown;
}) {
  const t = useTranslations('computation');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
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
        setError(data.error ?? t('composeInputError'));
        return;
      }
      setText(data.input ?? '');
    } catch {
      setError(t('composeInputError'));
    } finally {
      setLoading(false);
    }
  }

  // Render once the structure is available (and when the source changes); param
  // edits are picked up via the manual refresh so we don't spam the worker.
  useEffect(() => {
    if (structure) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure]);

  return (
    <div className='rounded-lg border'>
      <div className='flex items-center justify-between border-b px-3 py-1.5'>
        <span className='font-mono text-xs font-medium'>{t('composeInputTitle')}</span>
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
      {error ? (
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
