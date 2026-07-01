/**
 * ExploreMpView — Materials-Explorer-style search over the Materials Project.
 * Two columns: left = mode + periodic-table / text picker, right = results table.
 * State (mode / elements / query / results) is persisted in a module store so
 * switching subtabs keeps it; a full reload (F5) resets. Any result imports into
 * the crystal structure library in one click.
 *
 * @phase R326-explore-persist
 */
'use client';

import { IconDownload, IconLoader2, IconSearch, IconX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { formatSciNode } from '@/features/spectra/utils/format-units';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { type ExploreMode, exploreStore, type MpResult } from './explore-mp-store';
import { PeriodicTable } from './periodic-table';

const MODES: { value: ExploreMode; labelKey: string }[] = [
  { value: 'only', labelKey: 'mpModeOnly' },
  { value: 'atleast', labelKey: 'mpModeAtLeast' },
  { value: 'formula', labelKey: 'mpModeFormula' },
  { value: 'mpid', labelKey: 'mpModeId' }
];

const num = (v: number | null, digits: number) =>
  v === null || v === undefined ? '—' : v.toFixed(digits);

export function ExploreMpView() {
  const t = useTranslations('structures');
  const router = useRouter();
  const [mode, setMode] = useState<ExploreMode>(() => exploreStore.get().mode);
  const [selectedEls, setSelectedEls] = useState<ReadonlySet<string>>(
    () => new Set(exploreStore.get().selectedEls)
  );
  const [text, setText] = useState(() => exploreStore.get().text);
  const [results, setResults] = useState<MpResult[] | null>(() => exploreStore.get().results);
  const [error, setError] = useState<string | null>(() => exploreStore.get().error);
  const [busy, setBusy] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  // Persist across subtab navigation (reset only on full reload).
  useEffect(() => {
    exploreStore.set({ mode, selectedEls: [...selectedEls], text, results, error });
  }, [mode, selectedEls, text, results, error]);

  const isElementMode = mode === 'only' || mode === 'atleast';

  const toggleEl = (sym: string) => {
    setSelectedEls((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  };

  const buildQuery = (): string => {
    if (mode === 'only') return [...selectedEls].join('-');
    if (mode === 'atleast') return [...selectedEls].join(',');
    return text.trim();
  };

  const canSearch = !busy && (isElementMode ? selectedEls.size > 0 : text.trim().length > 0);

  async function search() {
    const q = buildQuery();
    if (q === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/structures/mp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 50 })
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

  async function importOne(mpId: string) {
    setImportingId(mpId);
    try {
      const res = await fetch('/api/structures/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'mp_id', mpId })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t('importFailed'));
        return;
      }
      toast.success(t('mpImportedToast', { id: mpId }));
      router.refresh();
    } catch {
      toast.error(t('importFailed'));
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      {/* Left — query builder */}
      <div className='space-y-3'>
        <div className='flex flex-wrap gap-1'>
          {MODES.map((m) => (
            <Button
              key={m.value}
              size='sm'
              variant={mode === m.value ? 'default' : 'outline'}
              onClick={() => setMode(m.value)}
            >
              {t(m.labelKey)}
            </Button>
          ))}
        </div>

        {isElementMode ? (
          <div className='space-y-2 rounded-lg border p-3'>
            <p className='text-muted-foreground text-xs'>
              {mode === 'only' ? t('mpModeOnlyHint') : t('mpModeAtLeastHint')}
            </p>
            <PeriodicTable selected={selectedEls} onToggle={toggleEl} />
            {selectedEls.size > 0 ? (
              <div className='flex flex-wrap items-center gap-1.5 pt-1'>
                {[...selectedEls].map((sym) => (
                  <Badge
                    key={sym}
                    variant='secondary'
                    className='cursor-pointer gap-1'
                    onClick={() => toggleEl(sym)}
                  >
                    {sym}
                    <IconX className='size-3' />
                  </Badge>
                ))}
                <Button variant='ghost' size='sm' onClick={() => setSelectedEls(new Set())}>
                  {t('clearSelection')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
            placeholder={mode === 'formula' ? t('mpFormulaPlaceholder') : t('mpIdPlaceholder')}
          />
        )}

        <Button onClick={() => void search()} disabled={!canSearch}>
          {busy ? (
            <IconLoader2 className='mr-1 size-4 animate-spin' />
          ) : (
            <IconSearch className='mr-1 size-4' />
          )}
          {t('mpSearchAction')}
        </Button>
      </div>

      {/* Right — results */}
      <div className='min-w-0'>
        {error ? <p className='text-destructive text-sm'>{error}</p> : null}

        {results === null && !error ? (
          <p className='text-muted-foreground py-8 text-center text-sm'>{t('mpResultsHint')}</p>
        ) : null}

        {results !== null && results.length === 0 && !error ? (
          <p className='text-muted-foreground py-8 text-center text-sm'>{t('mpSearchEmpty')}</p>
        ) : null}

        {results && results.length > 0 ? (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('mpColId')}</TableHead>
                  <TableHead>{t('mpColFormula')}</TableHead>
                  <TableHead>{t('mpColSystem')}</TableHead>
                  <TableHead>{t('mpColSpaceGroup')}</TableHead>
                  <TableHead className='text-right'>{t('mpColSites')}</TableHead>
                  <TableHead className='text-right'>{t('mpColHull')}</TableHead>
                  <TableHead className='text-right'>{t('mpColGap')}</TableHead>
                  <TableHead className='text-right'>{t('mpColDensity')}</TableHead>
                  <TableHead className='text-right'>{t('mpColVolume')}</TableHead>
                  <TableHead className='text-right'>{t('mpColAction')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.mpId}>
                    <TableCell className='font-mono text-xs'>
                      <a
                        href={`https://materialsproject.org/materials/${r.mpId}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-primary underline-offset-2 hover:underline'
                      >
                        {r.mpId}
                      </a>
                    </TableCell>
                    <TableCell className='font-medium'>{formatSciNode(r.formula)}</TableCell>
                    <TableCell className='capitalize'>{r.crystalSystem || '—'}</TableCell>
                    <TableCell>{r.spaceGroup ? formatSciNode(r.spaceGroup) : '—'}</TableCell>
                    <TableCell className='text-right tabular-nums'>{r.nsites ?? '—'}</TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        r.energyAboveHull === 0 && 'text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      {num(r.energyAboveHull, 3)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{num(r.bandGap, 2)}</TableCell>
                    <TableCell className='text-right tabular-nums'>{num(r.density, 2)}</TableCell>
                    <TableCell className='text-right tabular-nums'>{num(r.volume, 1)}</TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='outline'
                        size='sm'
                        disabled={importingId !== null}
                        onClick={() => void importOne(r.mpId)}
                      >
                        {importingId === r.mpId ? (
                          <IconLoader2 className='size-4 animate-spin' />
                        ) : (
                          <IconDownload className='size-4' />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
