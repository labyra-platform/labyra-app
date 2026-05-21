import { Skeleton } from '@/components/ui/skeleton';

/**
 * List-page loading skeleton — mimics a real data table.
 *
 * Header bar (title + action), then a bordered table with a header row and
 * varied column widths so it reads as "data loading" rather than gray blocks.
 *
 * @phase LOADING-POLISH
 */

// Column width templates (Tailwind fractions) — varied for realism.
const COLS = ['w-[18%]', 'w-[34%]', 'w-[20%]', 'w-[16%]', 'w-[12%]'];

export function ListSkeleton({
  rows = 8,
  columns = 5,
  withHeaderBar = true
}: {
  rows?: number;
  columns?: number;
  withHeaderBar?: boolean;
}) {
  const widths = Array.from({ length: columns }, (_, i) => COLS[i % COLS.length]);

  return (
    <div className='flex flex-1 flex-col space-y-4'>
      {withHeaderBar && (
        <div className='flex items-center justify-between'>
          <div className='space-y-2'>
            <Skeleton className='h-7 w-44' />
            <Skeleton className='h-4 w-64' />
          </div>
          <Skeleton className='h-9 w-28 rounded-md' />
        </div>
      )}

      <div className='overflow-hidden rounded-lg border'>
        {/* Header row */}
        <div className='bg-muted/40 flex items-center gap-4 border-b px-4 py-3'>
          {widths.map((w, i) => (
            <Skeleton key={i} className={`h-4 ${w}`} />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className='flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0'>
            {widths.map((w, i) => (
              <Skeleton
                key={i}
                className={`${i === columns - 1 ? 'h-5 rounded-full' : 'h-4'} ${w}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
