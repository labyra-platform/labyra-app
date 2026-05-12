'use client';
/**
 * Inline citation chip [N] — renders as clickable badge.
 * Click → scroll to source in sources panel + highlight.
 * @phase R160-ai-5d-3
 */
import { cn } from '@/lib/utils';

interface CitationChipProps {
  refNumber: number;
  totalSources: number;
  /** Called when chip clicked — parent scrolls/highlights source */
  onClick?: (refNumber: number) => void;
}

export function CitationChip({ refNumber, totalSources, onClick }: CitationChipProps) {
  // Don't render chip if refNumber out of bounds (LLM hallucinated [99])
  if (refNumber < 1 || refNumber > totalSources) {
    return <span className='text-muted-foreground'>[{refNumber}]</span>;
  }

  return (
    <button
      type='button'
      onClick={() => onClick?.(refNumber)}
      className={cn(
        'inline-flex items-center justify-center',
        'min-w-[1.4em] h-[1.4em] mx-0.5 px-1',
        'rounded-md text-[0.75em] font-medium',
        'bg-primary/10 text-primary hover:bg-primary/20',
        'transition-colors cursor-pointer',
        'border border-primary/20'
      )}
      aria-label={`Source ${refNumber}`}
    >
      {refNumber}
    </button>
  );
}
