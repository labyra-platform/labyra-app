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
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { formatSciNode, formatSpaceGroup } from '@/features/spectra/utils/format-units';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { type ExploreMode, exploreStore, type MpResult } from './explore-mp-store';
import { SortableHead, useSortRows } from '@/components/ui-extra/sortable-head';
import { PeriodicTable } from './periodic-table';

const num = (v: number | null, digits: number) =>
  v === null || v === undefined ? '—' : v.toFixed(digits);

export function ExploreMpView() {
  const t = useTranslations('structures');
  const router = useRouter();
  const [mode, setMode] = useState<ExploreMode>(() => {
    const m = exploreStore.get().mode;
    return m === 'atleast' ? 'atleast' : 'only';
  });
  const [selectedEls, setSelectedEls] = useState<ReadonlySet<string>>(
    () => new Set(exploreStore.get().selectedEls)
  );
  const [text, setText] = useState(() => exploreStore.get().text);
  const [results, setResults] = useState<MpResult[] | null>(() => exploreStore.get().results);
  const sortable = useSortRows(results ?? [], {
    mpId: (r) => r.mpId,
    formula: (r) => r.formula,
    system: (r) => r.crystalSystem,
    spaceGroup: (r) => r.spaceGroupNumber ?? r.spaceGroup,
    sites: (r) => r.nsites,
    hull: (r) => r.energyAboveHull,
    gap: (r) => r.bandGap,
    density: (r) => r.density,
    volume: (r) => r.volume
  });
  const [error, setError] = useState<string | null>(() => exploreStore.get().error);
  const [busy, setBusy] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  // Persist across subtab navigation (reset only on full reload).
  useEffect(() => {
    exploreStore.set({ mode, selectedEls: [...selectedEls], text, results, error });
  }, [mode, selectedEls, text, results, error]);

  const toggleEl = (sym: string) => {
    setSelectedEls((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  };

  const buildQuery = (): string => {
    const typed = text.trim();
    if (typed !== '') return typed; // formula / mp-id / chemsys — the worker parses it
    return mode === 'only' ? [...selectedEls].join('-') : [...selectedEls].join(',');
  };

  const canSearch = !busy && (text.trim().length > 0 || selectedEls.size > 0);

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
        <div className='space-y-2 rounded-lg border p-3'>
          <PeriodicTable
            selected={selectedEls}
            onToggle={toggleEl}
            overlay={
              <div className='flex w-full flex-col gap-2 pr-2'>
                <div className='space-y-1'>
                  <div className='flex items-center justify-between gap-2'>
                    <Label htmlFor='mp-text' className='text-xs'>
                      {t('mpTextLabel')}
                    </Label>
                    <Button
                      size='sm'
                      className='h-7'
                      onClick={() => void search()}
                      disabled={!canSearch}
                    >
                      {busy ? (
                        <IconLoader2 className='mr-1 size-3.5 animate-spin' />
                      ) : (
                        <IconSearch className='mr-1 size-3.5' />
                      )}
                      {t('mpSearchAction')}
                    </Button>
                  </div>
                  <Input
                    id='mp-text'
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void search();
                      }
                    }}
                    placeholder={t('mpTextPlaceholder')}
                    className='h-8'
                  />
                </div>
                <div className='flex flex-wrap items-center gap-1'>
                  <Button
                    size='sm'
                    variant={mode === 'only' ? 'default' : 'outline'}
                    className='h-7 px-2 text-xs'
                    onClick={() => setMode('only')}
                  >
                    {t('mpModeOnly')}
                  </Button>
                  <Button
                    size='sm'
                    variant={mode === 'atleast' ? 'default' : 'outline'}
                    className='h-7 px-2 text-xs'
                    onClick={() => setMode('atleast')}
                  >
                    {t('mpModeAtLeast')}
                  </Button>
                </div>
              </div>
            }
          />
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
          <div className='max-h-[70vh] overflow-auto rounded-lg border'>
            <Table>
              <TableHeader className='bg-background sticky top-0 z-10'>
                <TableRow>
                  <SortableHead
                    label={t('mpColId')}
                    sortKey='mpId'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <SortableHead
                    label={t('mpColFormula')}
                    sortKey='formula'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <SortableHead
                    label={t('mpColSystem')}
                    sortKey='system'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <SortableHead
                    label={t('mpColSpaceGroup')}
                    sortKey='spaceGroup'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <SortableHead
                    label={t('mpColSites')}
                    sortKey='sites'
                    align='right'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <SortableHead
                    label={t('mpColHull')}
                    sortKey='hull'
                    align='right'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <SortableHead
                    label={t('mpColGap')}
                    sortKey='gap'
                    align='right'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <SortableHead
                    label={t('mpColDensity')}
                    sortKey='density'
                    align='right'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <SortableHead
                    label={t('mpColVolume')}
                    sortKey='volume'
                    align='right'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <TableHead className='text-right'>{t('mpColAction')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortable.sorted.map((r) => (
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
                    <TableCell>{r.spaceGroup ? formatSpaceGroup(r.spaceGroup) : '—'}</TableCell>
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
