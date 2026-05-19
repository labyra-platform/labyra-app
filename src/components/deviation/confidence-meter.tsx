/**
 * ConfidenceMeter — horizontal bar 0-100% with accessible color coding.
 *
 * @phase R185-10a
 */
'use client';

import { cn } from '@/lib/utils';

interface ConfidenceMeterProps {
  value: number; // 0-1
  className?: string;
  showLabel?: boolean;
}

export function ConfidenceMeter({ value, className, showLabel = true }: ConfidenceMeterProps) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);

  let barColor = 'bg-emerald-500';
  if (percent < 50) barColor = 'bg-destructive';
  else if (percent < 70) barColor = 'bg-amber-500';
  else if (percent < 85) barColor = 'bg-sky-500';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className='relative h-2 flex-1 rounded-full bg-muted overflow-hidden'
        role='progressbar'
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confidence ${percent}%`}
      >
        <div
          className={cn('h-full transition-[width] motion-reduce:transition-none', barColor)}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <span className='text-xs font-medium text-muted-foreground tabular-nums w-10 text-right'>
          {percent}%
        </span>
      )}
    </div>
  );
}
