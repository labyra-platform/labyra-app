/**
 * Sortable table helpers — a clickable TableHead with asc/desc arrows and a
 * hook that sorts rows by named accessors. Strings sort with localeCompare
 * (natural, case-insensitive); numbers numerically; null/undefined always last.
 *
 * @phase R352-sortable-tables
 */
'use client';

import { IconArrowsSort, IconSortAscending, IconSortDescending } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';

export type SortAccessors<T> = Record<string, (row: T) => string | number | null | undefined>;

export function useSortRows<T>(rows: T[], accessors: SortAccessors<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>('asc');

  const toggle = (key: string) => {
    if (sortKey === key) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const get = accessors[sortKey];
    if (!get) return rows;
    const sign = dir === 'asc' ? 1 : -1;
    return rows.toSorted((a, b) => {
      const va = get(a);
      const vb = get(b);
      const aNil = va === null || va === undefined || va === '';
      const bNil = vb === null || vb === undefined || vb === '';
      if (aNil && bNil) return 0;
      if (aNil) return 1; // nulls last regardless of direction
      if (bNil) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
      return (
        String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) *
        sign
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, dir]);

  return { sorted, sortKey, dir, toggle };
}

export function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onToggle,
  className,
  align
}: {
  label: string;
  sortKey: string;
  activeKey: string | null;
  dir: SortDir;
  onToggle: (key: string) => void;
  className?: string;
  align?: 'left' | 'right';
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead className={cn(align === 'right' && 'text-right', className)}>
      <button
        type='button'
        onClick={() => onToggle(sortKey)}
        className={cn(
          'hover:text-foreground inline-flex items-center gap-1',
          align === 'right' && 'flex-row-reverse',
          active && 'text-foreground'
        )}
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <IconSortAscending className='size-3.5' />
          ) : (
            <IconSortDescending className='size-3.5' />
          )
        ) : (
          <IconArrowsSort className='size-3.5 opacity-40' />
        )}
      </button>
    </TableHead>
  );
}
