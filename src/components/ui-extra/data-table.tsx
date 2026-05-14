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

import { useMemo, useState, type ReactNode } from 'react';
import {
  IconChevronDown,
  IconChevronUp,
  IconArrowsSort,
  IconSortAscending,
  IconSortDescending,
  IconDownload
} from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';

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
  /** Custom value extractor for export (default: use column.cell as string) */
  exportValue?: (row: T, columnKey: string) => string | number | null;
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
  exportValue
}: DataTableProps<T>) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDirection>(defaultSort?.direction ?? null);

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDir) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortValue) return rows;
    const accessor = col.sortValue;
    return [...rows].sort((a, b) => {
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
  }, [rows, sortKey, sortDir, columns]);

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
      {(title || description) && (
        <button
          type='button'
          onClick={() => setCollapsed((c) => !c)}
          className='flex w-full items-center justify-between border-b p-3 text-left hover:bg-muted/30'
        >
          <div>
            {title && <h3 className='text-sm font-medium'>{title}</h3>}
            {description && <p className='text-xs text-muted-foreground'>{description}</p>}
          </div>
          {collapsed ? (
            <IconChevronDown className='size-4 text-muted-foreground' />
          ) : (
            <IconChevronUp className='size-4 text-muted-foreground' />
          )}
        </button>
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
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className='px-2 py-2 text-left font-medium'
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
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, idx) => (
                    <tr key={rowKey(row, idx)} className='border-t hover:bg-muted/30'>
                      {columns.map((col) => (
                        <td key={col.key} className={col.cellClassName ?? 'px-2 py-1.5'}>
                          {col.cell(row, idx)}
                        </td>
                      ))}
                    </tr>
                  ))}
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
