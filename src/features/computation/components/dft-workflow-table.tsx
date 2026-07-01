/**
 * Computation list — sortable/filterable table of DFT workflows (R301 redesign,
 * replacing the 2-col results-card grid). Each row links to the workflow
 * workspace. `md+` renders a shadcn table; below that, stacked cards.
 *
 * Columns map only to data the worker writes (status · job+method · pipeline ·
 * result). No Resource/duration column and no "recent" sort — the doc carries
 * no timing or `createdAt` (see workflow-row.ts).
 *
 * @phase R301-computation-list
 */
'use client';

import { IconArrowsSort, IconSearch } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
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
import type { ResultCell, StatusKind, WorkflowRow } from '@/features/computation/workflow-row';
import { Link, useRouter } from '@/i18n/navigation';
import { WorkflowPipelineMini } from './workflow-pipeline-mini';

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

  const filters: Filter[] = ['all', 'running', 'completed', 'failed'];

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
          <div className='flex items-center gap-1'>
            {filters.map((f) => (
              <Button
                key={f}
                size='sm'
                variant={filter === f ? 'default' : 'outline'}
                onClick={() => setFilter(f)}
              >
                {t(`filter.${f}`)}
              </Button>
            ))}
          </div>
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

      {view.length === 0 ? (
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('noFilterMatch')}</div>
      ) : (
        <>
          <div className='hidden overflow-hidden rounded-lg border md:block'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-[120px]'>{t('table.colStatus')}</TableHead>
                  <TableHead>{t('table.colJob')}</TableHead>
                  <TableHead>{t('table.colPipeline')}</TableHead>
                  <TableHead>{t('table.colResult')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.map((r) => (
                  <TableRow
                    key={r.id}
                    className='hover:bg-muted/50 cursor-pointer'
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a')) return;
                      router.push(href(r.id));
                    }}
                  >
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
                    <TableCell>
                      <ResultCellView cell={r.result} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className='space-y-3 md:hidden'>
            {view.map((r) => (
              <Link
                key={r.id}
                href={href(r.id)}
                className='hover:bg-muted/50 block rounded-lg border p-3'
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='truncate font-medium'>{r.name}</span>
                  <Badge variant={STATUS_VARIANT[r.status]}>{t(`status.${r.status}`)}</Badge>
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
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
