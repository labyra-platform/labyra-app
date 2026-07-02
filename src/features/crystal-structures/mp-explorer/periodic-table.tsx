/**
 * PeriodicTable — an 18-column selectable element grid for the MP Explorer.
 * Elements toggle in/out of the selection; the La–Lu / Ac–Lr slots show
 * non-interactive markers and the two series render below. Disabled in formula /
 * mp-id modes (where the query is typed, not element-picked).
 *
 * @phase R325-mp-explorer
 */
'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CATEGORY_CLASS, PERIODIC_ELEMENTS, PERIODIC_PLACEHOLDERS } from './periodic-table-data';

export function PeriodicTable({
  selected,
  onToggle,
  disabled = false,
  overlay
}: {
  selected: ReadonlySet<string>;
  onToggle: (sym: string) => void;
  disabled?: boolean;
  /** Content dropped into the empty top-left block (rows 1–3, groups 3–12). */
  overlay?: ReactNode;
}) {
  return (
    <div className='overflow-x-auto pb-1'>
      <div
        className='grid min-w-[680px] gap-1'
        style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))' }}
      >
        {overlay ? (
          <div style={{ gridColumn: '3 / 13', gridRow: '1 / 4' }} className='flex items-center'>
            {overlay}
          </div>
        ) : null}
        {PERIODIC_PLACEHOLDERS.map((p) => (
          <div
            key={p.label}
            style={{ gridColumn: p.col, gridRow: p.row }}
            className={cn(
              'flex aspect-square items-center justify-center rounded-sm text-[10px] font-medium leading-none',
              CATEGORY_CLASS[p.category]
            )}
          >
            {p.label}
          </div>
        ))}
        {PERIODIC_ELEMENTS.map((el) => {
          const isSel = selected.has(el.sym);
          return (
            <button
              key={el.sym}
              type='button'
              disabled={disabled}
              onClick={() => onToggle(el.sym)}
              style={{ gridColumn: el.col, gridRow: el.row }}
              aria-pressed={isSel}
              className={cn(
                'flex aspect-square items-center justify-center rounded-sm text-[13px] font-semibold leading-none transition-all',
                CATEGORY_CLASS[el.category],
                isSel && 'ring-primary ring-2 ring-offset-1',
                disabled ? 'cursor-not-allowed opacity-40' : 'hover:brightness-110'
              )}
            >
              {el.sym}
            </button>
          );
        })}
      </div>
    </div>
  );
}
