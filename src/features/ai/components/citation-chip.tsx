'use client';
/**
 * Inline citation chip [N] — renders as clickable badge.
 * Click → scroll to source in sources panel + highlight.
 * @phase R160-ai-5d-3
 */
import { cn } from '@/lib/utils';

interface CitationChipProps {
  refNumber: number;
  /** Number shown on the chip (Vancouver order-of-appearance). Falls back to refNumber. */
  displayNumber?: number;
  totalSources: number;
  /** Called when chip clicked — parent scrolls/highlights source */
  onClick?: (refNumber: number) => void;
}

export function CitationChip({
  refNumber,
  displayNumber,
  totalSources,
  onClick
}: CitationChipProps) {
  // Don't render chip if refNumber out of bounds (LLM hallucinated [99])
  if (refNumber < 1 || refNumber > totalSources) {
    return <span className='text-muted-foreground'>[{refNumber}]</span>;
  }

  const label = displayNumber ?? refNumber;

  return (
    <button
      type='button'
      onClick={() => onClick?.(refNumber)}
      className={cn(
        'inline-flex items-center justify-center align-middle',
        'mx-0.5 h-[1.5em] min-w-[1.5em] px-1',
        'rounded text-[0.72em] font-semibold leading-none',
        'bg-primary/15 text-primary hover:bg-primary/25',
        'border border-primary/30 transition-colors cursor-pointer'
      )}
      aria-label={`Source ${label}`}
    >
      {label}
    </button>
  );
}
