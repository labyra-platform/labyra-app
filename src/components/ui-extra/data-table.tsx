/**
 * DataTable — generic sortable + collapsible table.
 *
 * Features:
 * - Click header → sort asc/desc/none (3-cycle)
 * - Collapse toggle (chevron in header)
 * - Sticky header inside scroll container
 *
 * @phase R161-data-table
 */
'use client';

import {
  IconArrowsSort,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconSearch,
  IconSortAscending,
  IconSortDescending
} from '@tabler/icons-react';
import { type ReactNode, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Function to render cell content */
  cell: (row: T, idx: number) => ReactNode;
  /** Sort accessor; if missing column is not sortable */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Optional tooltip on header */
  title?: string;
  /** Cell className */
  cellClassName?: string;
  /** R505: header className. Needed so an aligned column (e.g. right-aligned
   *  numerics) keeps its header over its cells instead of drifting left. */
  headerClassName?: string;
}

interface DataTableProps<T> {
  title?: string;
  description?: string;
  rows: T[];
  columns: DataTableColumn<T>[];
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  initialCollapsed?: boolean;
  rowKey: (row: T, idx: number) => string;
  footer?: ReactNode;
  emptyMessage?: string;
  /** If set, shows export button. Filename without extension. */
  exportFilename?: string;
  /** R505: opt-in search. The toolbar reserved a flex-1 spacer next to Export
   *  and left it empty; a table long enough to need Export is long enough to
   *  need finding a row. Owner decides what a row's searchable text is. */
  searchValue?: (row: T) => string;
  searchPlaceholder?: string;
  /** Custom value extractor for export (default: use column.cell as string) */
  exportValue?: (row: T, columnKey: string) => string | number | null;
  /** #7: show a leading checkbox column for multi-row selection (opt-in). */
  selectable?: boolean;
  /** Called whenever selection changes (selected row keys). */
  onSelectionChange?: (selectedKeys: string[]) => void;
  /** Render a bulk-action bar shown above the table when rows are selected. */
  renderBulkActions?: (selectedKeys: string[]) => ReactNode;
  /** #7: trailing per-row actions (caller builds a kebab DropdownMenu). */
  rowActions?: (row: T) => ReactNode;
}

type SortDirection = 'asc' | 'desc' | null;

export function DataTable<T>({
  title,
  description,
  rows,
  columns,
  defaultSort,
  initialCollapsed = false,
  rowKey,
  footer,
  emptyMessage = 'No data.',
  exportFilename,
  exportValue,
  searchValue,
  searchPlaceholder,
  selectable = false,
  onSelectionChange,
  renderBulkActions,
  rowActions
}: DataTableProps<T>) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDirection>(defaultSort?.direction ?? null);

  const searchedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchValue || !q) return rows;
    return rows.filter((r) => searchValue(r).toLowerCase().includes(q));
  }, [rows, query, searchValue]);

  const sortedRows = useMemo(() => {
    const rows = searchedRows;
    if (!sortKey || !sortDir) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const accessor = col.sortValue;
    return [...rows].toSorted((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [searchedRows, sortKey, sortDir, columns]);

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const emitSelection = (next: Set<string>) => {
    setSelectedKeys(next);
    onSelectionChange?.([...next]);
  };
  const toggleRow = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    emitSelection(next);
  };
  const allKeys = sortedRows.map((r, i) => rowKey(r, i));
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.has(k));
  const someSelected = allKeys.some((k) => selectedKeys.has(k));
  const toggleAll = () => {
    emitSelection(allSelected ? new Set() : new Set(allKeys));
  };

  const handleExport = () => {
    if (!sortedRows.length) return;
    const data = sortedRows.map((row, idx) => {
      const obj: Record<string, string | number | null> = {};
      for (const col of columns) {
        if (exportValue) {
          obj[col.header] = exportValue(row, col.key);
        } else if (col.sortValue) {
          obj[col.header] = col.sortValue(row) ?? null;
        } else {
          obj[col.header] = String(col.cell(row, idx) ?? '');
        }
      }
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const filename = exportFilename ?? 'table';
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const renderSortIcon = (key: string) => {
    if (sortKey !== key) return <IconArrowsSort className='size-3 opacity-40' />;
    if (sortDir === 'asc') return <IconSortAscending className='size-3' />;
    return <IconSortDescending className='size-3' />;
  };

  return (
    <div className='rounded-lg border bg-card'>
      {(title || description || exportFilename || searchValue) && (
        <div className='flex w-full items-center justify-between border-b p-3'>
          {title || description ? (
            <button
              type='button'
              onClick={() => setCollapsed((c) => !c)}
              className='flex-1 text-left hover:bg-muted/30 rounded p-1 -m-1'
            >
              {title && <h3 className='text-sm font-medium'>{title}</h3>}
              {description && <p className='text-xs text-muted-foreground'>{description}</p>}
            </button>
          ) : (
            <div className='flex-1' />
          )}
          <div className='flex items-center gap-2'>
            {searchValue && !collapsed && (
              <div className='relative'>
                <IconSearch className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2' />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className='h-8 w-40 pl-7 text-xs sm:w-56'
                />
              </div>
            )}
            {exportFilename && !collapsed && sortedRows.length > 0 && (
              <Button
                variant='outline'
                size='sm'
                onClick={handleExport}
                className='gap-1'
                title='Export to Excel (.xlsx)'
              >
                <IconDownload className='size-3.5' />
                Export
              </Button>
            )}
            {(title || description) && (
              <button
                type='button'
                onClick={() => setCollapsed((c) => !c)}
                className='p-1 hover:bg-muted/30 rounded'
              >
                {collapsed ? (
                  <IconChevronDown className='size-4 text-muted-foreground' />
                ) : (
                  <IconChevronUp className='size-4 text-muted-foreground' />
                )}
              </button>
            )}
          </div>
        </div>
      )}
      {!collapsed && selectable && selectedKeys.size > 0 && (
        <div className='flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2'>
          <span className='text-xs text-muted-foreground'>{selectedKeys.size} selected</span>
          <div className='flex items-center gap-2'>
            {renderBulkActions?.([...selectedKeys])}
            <Button
              variant='ghost'
              size='sm'
              onClick={() => emitSelection(new Set())}
              className='h-7 text-xs'
            >
              Clear
            </Button>
          </div>
        </div>
      )}
      {!collapsed && (
        <>
          {sortedRows.length === 0 ? (
            <div className='p-4 text-sm text-muted-foreground'>{emptyMessage}</div>
          ) : (
            <div className='overflow-x-auto max-h-[600px] overflow-y-auto'>
              <table className='w-full text-xs'>
                <thead className='sticky top-0 bg-muted/80 backdrop-blur'>
                  <tr>
                    {selectable && (
                      <th className='w-8 px-2 py-2'>
                        <Checkbox
                          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleAll}
                          aria-label='Select all'
                        />
                      </th>
                    )}
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className={cn('px-2 py-2 text-left font-medium', col.headerClassName)}
                        title={col.title}
                      >
                        {col.sortValue ? (
                          <button
                            type='button'
                            onClick={() => handleSort(col.key)}
                            className='inline-flex items-center gap-1 hover:underline'
                          >
                            {col.header}
                            {renderSortIcon(col.key)}
                          </button>
                        ) : (
                          col.header
                        )}
                      </th>
                    ))}
                    {rowActions && <th className='w-8 px-2 py-2' aria-label='Actions' />}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, idx) => {
                    const key = rowKey(row, idx);
                    return (
                      <tr key={key} className='border-t hover:bg-muted/30'>
                        {selectable && (
                          <td className='px-2 py-1.5'>
                            <Checkbox
                              checked={selectedKeys.has(key)}
                              onCheckedChange={() => toggleRow(key)}
                              aria-label='Select row'
                            />
                          </td>
                        )}
                        {columns.map((col) => (
                          <td key={col.key} className={col.cellClassName ?? 'px-2 py-1.5'}>
                            {col.cell(row, idx)}
                          </td>
                        ))}
                        {rowActions && (
                          <td className='px-2 py-1.5 text-right'>{rowActions(row)}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {footer && (
            <div className='border-t bg-muted/30 p-2 text-[10px] text-muted-foreground'>
              {footer}
            </div>
          )}
        </>
      )}
    </div>
  );
}
