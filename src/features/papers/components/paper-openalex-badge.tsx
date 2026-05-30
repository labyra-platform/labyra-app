'use client';

/**
 * OpenAlex classification badge — authoritative Domain→Field→Subfield→Topic.
 *
 * Option B (R237ca): OpenAlex is the PRIMARY classification (this badge), shown
 * prominently in the card and detail header; the Gemini taxonomy chips
 * (PaperDomainBadge / DomainSection) are kept for materials-specific subtopics.
 *
 * Two variants:
 *   - 'compact' (card): a single field chip with a verified mark.
 *   - 'full' (detail): field › subfield breadcrumb + topic name + score.
 *
 * Renders nothing when the paper has no OpenAlex field/topic (no DOI or not in
 * OpenAlex), so the Gemini taxonomy stands alone as fallback.
 *
 * @phase R237ca
 */
import { IconRosetteDiscountCheck } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface Props {
  field: string | undefined;
  subfield?: string;
  topic?: string;
  score?: number;
  variant?: 'compact' | 'full';
  className?: string;
}

export function PaperOpenAlexBadge({
  field,
  subfield,
  topic,
  score,
  variant = 'compact',
  className
}: Props) {
  const t = useTranslations('papers');
  const f = (field ?? '').trim();
  if (!f) return null;

  const pct = typeof score === 'number' && score > 0 ? Math.round(score * 100) : null;

  if (variant === 'compact') {
    return (
      <span
        title={[f, subfield, topic].filter(Boolean).join(' › ')}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium leading-none',
          'bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-300',
          className
        )}
      >
        <IconRosetteDiscountCheck className='size-3.5 shrink-0' aria-hidden />
        {f}
      </span>
    );
  }

  // full (detail)
  const sub = (subfield ?? '').trim();
  const top = (topic ?? '').trim();
  return (
    <section className={cn('space-y-1.5', className)}>
      <h2 className='flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-muted-foreground'>
        <IconRosetteDiscountCheck className='size-4 text-sky-600 dark:text-sky-400' aria-hidden />
        {t('openalexClassification')}
      </h2>
      <div className='flex flex-wrap items-center gap-1.5'>
        <span className='inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-300'>
          {f}
        </span>
        {sub && (
          <>
            <span className='text-xs text-muted-foreground' aria-hidden>
              ›
            </span>
            <span className='rounded-md bg-muted/60 px-2 py-0.5 text-xs text-foreground/80'>
              {sub}
            </span>
          </>
        )}
        {top && top !== sub && (
          <>
            <span className='text-xs text-muted-foreground' aria-hidden>
              ›
            </span>
            <span className='rounded-md bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground'>
              {top}
            </span>
          </>
        )}
        {pct !== null && (
          <span
            className='ml-0.5 text-[10.5px] tabular-nums text-muted-foreground'
            title={t('openalexScoreLabel')}
          >
            {pct}%
          </span>
        )}
      </div>
    </section>
  );
}
