/**
 * ExploreMpView — Materials-Explorer-style search over the Materials Project.
 * Pick elements on the periodic table (only / at-least) or type a formula / mp-id,
 * search through /api/structures/mp-search, and import any result into the crystal
 * structure library. Full result table: id · formula · system · space group ·
 * sites · E above hull · band gap · density · volume.
 *
 * @phase R325-mp-explorer
 */
'use client';

import { IconDownload, IconLoader2, IconSearch, IconX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatSciNode } from '@/features/spectra/utils/format-units';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { PeriodicTable } from './periodic-table';

type Mode = 'only' | 'atleast' | 'formula' | 'mpid';

interface MpResult {
  mpId: string;
  formula: string;
  crystalSystem: string;
  spaceGroup: string;
  spaceGroupNumber: number | null;
  nsites: number | null;
  energyAboveHull: number | null;
  bandGap: number | null;
  isGapDirect: boolean | null;
  density: number | null;
  volume: number | null;
  theoretical: boolean | null;
}

const num = (v: number | null, digits: number, suffix = '') =>
  v === null || v === undefined ? '—' : `${v.toFixed(digits)}${suffix}`;

export function ExploreMpView() {
  const t = useTranslations('structures');
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('formula');
  const [selectedEls, setSelectedEls] = useState<ReadonlySet<string>>(() => new Set());
  const [text, setText] = useState('');
  const [results, setResults] = useState<MpResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

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
    <div className='space-y-4'>
      {/* Mode + query row */}
      <div className='space-y-3'>
        <ToggleGroup
          type='single'
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          variant='outline'
          size='sm'
          className='justify-start'
        >
          <ToggleGroupItem value='only'>{t('mpModeOnly')}</ToggleGroupItem>
          <ToggleGroupItem value='atleast'>{t('mpModeAtLeast')}</ToggleGroupItem>
          <ToggleGroupItem value='formula'>{t('mpModeFormula')}</ToggleGroupItem>
          <ToggleGroupItem value='mpid'>{t('mpModeId')}</ToggleGroupItem>
        </ToggleGroup>

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

      {error ? <p className='text-destructive text-sm'>{error}</p> : null}

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
  );
}
