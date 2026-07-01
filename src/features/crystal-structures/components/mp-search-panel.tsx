/**
 * MpSearchPanel — search Materials Project (formula / elements / mp-id) and pick a
 * result to import, Materials-Explorer style. Rows show formula · id · crystal
 * system · space group · band gap; selecting one fills the import target via
 * onSelect. Read-only search through /api/structures/mp-search.
 *
 * @phase R323-mp-search
 */
'use client';

import { IconLoader2, IconSearch } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MpResult {
  mpId: string;
  formula: string;
  crystalSystem: string;
  spaceGroup: string;
  bandGap: number | null;
  energyAboveHull: number | null;
  nsites: number | null;
  theoretical: boolean | null;
}

export function MpSearchPanel({
  selectedId,
  onSelect
}: {
  selectedId: string;
  onSelect: (mpId: string, formula: string) => void;
}) {
  const t = useTranslations('structures');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MpResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const q = query.trim();
    if (q === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/structures/mp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      const data = (await res.json().catch(() => ({}))) as {
        results?: MpResult[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? t('mpSearchFailed'));
        setResults([]);
        return;
      }
      setResults(data.results ?? []);
    } catch {
      setError(t('mpSearchFailed'));
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='space-y-2'>
      <div className='flex gap-2'>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void run();
            }
          }}
          placeholder={t('mpSearchPlaceholder')}
        />
        <Button type='button' variant='outline' onClick={() => void run()} disabled={busy}>
          {busy ? (
            <IconLoader2 className='size-4 animate-spin' />
          ) : (
            <IconSearch className='size-4' />
          )}
        </Button>
      </div>

      {error ? <p className='text-destructive text-xs'>{error}</p> : null}

      {results !== null && results.length === 0 && !error ? (
        <p className='text-muted-foreground text-xs'>{t('mpSearchEmpty')}</p>
      ) : null}

      {results && results.length > 0 ? (
        <div className='max-h-56 overflow-y-auto rounded-md border'>
          <div className='text-muted-foreground bg-muted/40 flex items-center gap-3 px-3 py-1.5 text-[11px] font-medium'>
            <span className='w-24 shrink-0'>{t('mpColFormula')}</span>
            <span className='w-24 shrink-0'>{t('mpColId')}</span>
            <span className='w-20 shrink-0'>{t('mpColSystem')}</span>
            <span className='w-16 shrink-0'>{t('mpColSpaceGroup')}</span>
            <span className='shrink-0'>{t('mpColGap')}</span>
          </div>
          <div className='divide-y'>
            {results.map((r) => {
              const active = r.mpId === selectedId;
              return (
                <button
                  key={r.mpId}
                  type='button'
                  onClick={() => onSelect(r.mpId, r.formula)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors',
                    active ? 'bg-primary/10' : 'hover:bg-muted/60'
                  )}
                >
                  <span className='w-24 shrink-0 truncate font-medium'>{r.formula || '—'}</span>
                  <span className='text-muted-foreground w-24 shrink-0 truncate font-mono'>
                    {r.mpId}
                  </span>
                  <span className='w-20 shrink-0 truncate capitalize'>
                    {r.crystalSystem || '—'}
                  </span>
                  <span className='w-16 shrink-0 truncate'>{r.spaceGroup || '—'}</span>
                  <span className='shrink-0 tabular-nums'>
                    {r.bandGap === null ? '—' : `${r.bandGap.toFixed(2)} eV`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
