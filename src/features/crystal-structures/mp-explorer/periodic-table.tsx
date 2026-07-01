/**
 * PeriodicTable — an 18-column selectable element grid for the MP Explorer.
 * Elements toggle in/out of the selection; the La–Lu / Ac–Lr slots show
 * non-interactive markers and the two series render below. Disabled in formula /
 * mp-id modes (where the query is typed, not element-picked).
 *
 * @phase R325-mp-explorer
 */
'use client';

import { cn } from '@/lib/utils';
import { CATEGORY_CLASS, PERIODIC_ELEMENTS, PERIODIC_PLACEHOLDERS } from './periodic-table-data';

export function PeriodicTable({
  selected,
  onToggle,
  disabled = false
}: {
  selected: ReadonlySet<string>;
  onToggle: (sym: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className='overflow-x-auto pb-1'>
      <div
        className='grid min-w-[680px] gap-1'
        style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))' }}
      >
        {PERIODIC_PLACEHOLDERS.map((p) => (
          <div
            key={p.label}
            style={{ gridColumn: p.col, gridRow: p.row }}
            className={cn(
              'flex aspect-square items-center justify-center rounded-sm text-[8px] font-medium leading-none',
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
                'flex aspect-square items-center justify-center rounded-sm text-[11px] font-semibold leading-none transition-all',
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
