/**
 * Computation list — sortable/filterable table of DFT workflows (R301 redesign).
 * Each row links to the workflow workspace. `md+` renders a shadcn table; below
 * that, stacked cards. Row kebab (Open / Delete) + bulk row-select with a
 * "Delete selected" bar, matching the other list pages (R321).
 *
 * Columns map only to data the worker writes (status · job+method · pipeline ·
 * result). No Resource/duration column and no "recent" sort — the doc carries
 * no timing or `createdAt` (see workflow-row.ts).
 *
 * @phase R301-computation-list / R321-job-kebab-bulk
 */
'use client';

import { IconArrowsSort, IconSearch, IconTrash } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { ResultCell, StatusKind, WorkflowRow } from '@/features/computation/workflow-row';
import { Link, useRouter } from '@/i18n/navigation';
import { WorkflowPipelineMini } from './workflow-pipeline-mini';
import { SortableHead, useSortRows } from '@/components/ui-extra/sortable-head';
import { formatDuration } from '@/features/computation/workflow-row';
import { WorkflowRowActions } from './workflow-row-actions';

const STATUS_VARIANT: Record<StatusKind, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  running: 'secondary',
  failed: 'destructive',
  queued: 'outline',
  pending: 'outline'
};

/** Sort weight: active jobs first, completed last. */
const STATUS_ORDER: Record<StatusKind, number> = {
  running: 0,
  failed: 1,
  queued: 2,
  pending: 3,
  completed: 4
};

type Filter = 'all' | 'running' | 'completed' | 'failed';
type Sort = 'name' | 'status';

const href = (id: string) => `/dashboard/computation/${id}`;

/** Compact Hubbard-U summary, e.g. "W-5d 6.2 · O-2p 9". */
const fmtDate = (ms: number | null) => {
  if (ms == null) return '—';
  const d = new Date(ms);
  const now = Date.now();
  const day = 86400000;
  // Recent → relative ("2h ago", "3d ago"); older → absolute date.
  const diff = now - ms;
  if (diff < day) {
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.max(1, Math.floor(diff / 60000))}m ago`;
    return `${h}h ago`;
  }
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fmtU = (r: WorkflowRow) => r.hubbard.map((h) => `${h.manifold} ${h.value}`).join(' · ');

function ResultCellView({ cell }: { cell: ResultCell }) {
  const t = useTranslations('computation');
  if (cell.kind === 'done') {
    if (cell.gapEv == null && cell.energyRy == null) {
      return <span className='text-muted-foreground text-xs'>{t('noParsedResults')}</span>;
    }
    return (
      <span className='text-xs tabular-nums'>
        {cell.gapEv != null ? (
          <>
            <span className='text-foreground font-medium'>{cell.gapEv.toFixed(2)} eV</span>
            {cell.direct != null ? (
              <span className='text-muted-foreground'>
                {' '}
                {cell.direct ? t('direct') : t('indirect')}
              </span>
            ) : null}
          </>
        ) : null}
        {cell.energyRy != null ? (
          <span className='text-muted-foreground'>
            {cell.gapEv != null ? ' · ' : ''}
            {cell.energyRy.toFixed(2)} Ry
          </span>
        ) : null}
      </span>
    );
  }
  if (cell.kind === 'failed') {
    return <span className='text-destructive text-xs'>{cell.reason ?? t('status.failed')}</span>;
  }
  if (cell.kind === 'running') {
    return (
      <span className='text-muted-foreground text-xs'>
        {cell.unit ? t('resultRunningUnit', { unit: cell.unit }) : t('status.running')}
      </span>
    );
  }
  return <span className='text-muted-foreground text-xs'>—</span>;
}

interface Props {
  rows: WorkflowRow[];
}

export function DftWorkflowTable({ rows }: Props) {
  const t = useTranslations('computation');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)) return false;
      if (filter === 'completed') return r.status === 'completed';
      if (filter === 'failed') return r.status === 'failed';
      if (filter === 'running') return r.status === 'running' || r.status === 'queued';
      return true;
    });
    return matched.toSorted((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)
    );
  }, [rows, query, filter, sort]);

  const sortable = useSortRows(view, {
    status: (r) => r.status,
    job: (r) => r.name,
    duration: (r) => r.totalDurationSec,
    created: (r) => r.createdAt
  });
  const sortedView = sortable.sorted;

  const filters: Filter[] = ['all', 'running', 'completed', 'failed'];

  const viewIds = view.map((r) => r.id);
  const allSelected = viewIds.length > 0 && viewIds.every((id) => selected.has(id));
  const someSelected = viewIds.some((id) => selected.has(id));
  const headerState: boolean | 'indeterminate' = allSelected
    ? true
    : someSelected
      ? 'indeterminate'
      : false;

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) viewIds.forEach((id) => next.delete(id));
      else viewIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.allSettled(
        ids.map((id) => fetch(`/api/dft/workflows/${id}`, { method: 'DELETE' }))
      );
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='relative max-w-xs flex-1'>
          <IconSearch
            className='text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4'
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className='pl-8'
          />
        </div>
        <div className='flex items-center gap-2'>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className='h-9 w-[150px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filters.map((f) => (
                <SelectItem key={f} value={f}>
                  {t(`filter.${f}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => setSort((s) => (s === 'name' ? 'status' : 'name'))}
            title={t('sortBy')}
          >
            <IconArrowsSort className='size-4' aria-hidden />
            {sort === 'name' ? t('sortName') : t('sortStatus')}
          </Button>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className='bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2'>
          <span className='text-sm'>{t('selectedCount', { count: selected.size })}</span>
          <div className='flex items-center gap-2'>
            <Button size='sm' variant='ghost' onClick={() => setSelected(new Set())}>
              {t('clearSelection')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={bulkBusy}
              onClick={() => void bulkDelete()}
              className='border-destructive/40 text-destructive hover:bg-destructive/10'
            >
              <IconTrash className='mr-1 size-4' />
              {t('deleteSelected', { count: selected.size })}
            </Button>
          </div>
        </div>
      ) : null}

      {view.length === 0 ? (
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('noFilterMatch')}</div>
      ) : (
        <>
          <div className='hidden overflow-hidden rounded-lg border md:block'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-10'>
                    <Checkbox
                      checked={headerState}
                      onCheckedChange={toggleAll}
                      aria-label={t('selectAll')}
                    />
                  </TableHead>
                  <SortableHead
                    label={t('table.colStatus')}
                    sortKey='status'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                    className='w-[120px]'
                  />
                  <SortableHead
                    label={t('table.colJob')}
                    sortKey='job'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <TableHead>{t('table.colPipeline')}</TableHead>
                  <SortableHead
                    label={t('table.colDuration')}
                    sortKey='duration'
                    align='right'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <SortableHead
                    label={t('table.colCreated')}
                    sortKey='created'
                    activeKey={sortable.sortKey}
                    dir={sortable.dir}
                    onToggle={sortable.toggle}
                  />
                  <TableHead>{t('table.colResult')}</TableHead>
                  <TableHead className='w-10' />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedView.map((r) => (
                  <TableRow
                    key={r.id}
                    data-state={selected.has(r.id) ? 'selected' : undefined}
                    className='hover:bg-muted/50 cursor-pointer'
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a,button')) return;
                      router.push(href(r.id));
                    }}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleOne(r.id)}
                        aria-label={r.name}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status]}>{t(`status.${r.status}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={href(r.id)} className='font-medium hover:underline'>
                        {r.name}
                      </Link>
                      <span className='text-muted-foreground ml-2 text-xs uppercase'>
                        {r.method}
                      </span>
                      {r.hubbard.length > 0 ? (
                        <div className='text-muted-foreground text-xs tabular-nums'>{fmtU(r)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <WorkflowPipelineMini steps={r.steps} />
                    </TableCell>
                    <TableCell className='text-right text-xs tabular-nums'>
                      {formatDuration(r.totalDurationSec) ?? '—'}
                    </TableCell>
                    <TableCell className='text-xs'>
                      <div className='tabular-nums'>{fmtDate(r.createdAt)}</div>
                      {r.createdBy ? (
                        <div className='text-muted-foreground max-w-[140px] truncate'>
                          {r.createdBy}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <ResultCellView cell={r.result} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <WorkflowRowActions
                        id={r.id}
                        name={r.name}
                        onDeleted={() => router.refresh()}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className='space-y-3 md:hidden'>
            {view.map((r) => (
              <div key={r.id} className='rounded-lg border p-3'>
                <div className='flex items-center gap-2'>
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={() => toggleOne(r.id)}
                    aria-label={r.name}
                  />
                  <Link
                    href={href(r.id)}
                    className='min-w-0 flex-1 truncate font-medium hover:underline'
                  >
                    {r.name}
                  </Link>
                  <Badge variant={STATUS_VARIANT[r.status]}>{t(`status.${r.status}`)}</Badge>
                  <WorkflowRowActions id={r.id} name={r.name} onDeleted={() => router.refresh()} />
                </div>
                <div className='text-muted-foreground mt-0.5 text-xs uppercase'>{r.method}</div>
                {r.hubbard.length > 0 ? (
                  <div className='text-muted-foreground text-xs tabular-nums'>{fmtU(r)}</div>
                ) : null}
                <div className='mt-2'>
                  <WorkflowPipelineMini steps={r.steps} />
                </div>
                <div className='mt-2'>
                  <ResultCellView cell={r.result} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
