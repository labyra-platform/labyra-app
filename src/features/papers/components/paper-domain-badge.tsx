'use client';

/**
 * Paper domain badge — primary + subtopics chips.
 *
 * Renders in paper-detail.tsx header. Primary chip prominent with axis color;
 * subtopics smaller. Hidden if domain is undefined/unknown and no subtopics.
 *
 * @phase R178-3
 * @r178-3-applied
 */
import { useTranslations } from 'next-intl';
import { AXIS_COLOR, getAxis } from '@/features/papers/lib/taxonomy';
import { cn } from '@/lib/utils';

interface Props {
  primary: string | undefined;
  subtopics: string[] | undefined;
  confidence?: 'high' | 'medium' | 'low';
}

const CONFIDENCE_COLOR: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  low: 'bg-muted text-muted-foreground'
};

export function PaperDomainBadge({ primary, subtopics, confidence }: Props) {
  const t = useTranslations('papers');

  const hasPrimary = primary && primary !== 'unknown';
  const hasSubtopics = subtopics && subtopics.length > 0;
  if (!hasPrimary && !hasSubtopics) return null;

  const primaryAxis = primary ? getAxis(primary) : null;

  return (
    <div className='flex flex-wrap items-center gap-1.5 text-xs'>
      {hasPrimary && primaryAxis && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium',
            AXIS_COLOR[primaryAxis]
          )}
          aria-label={t('domainPrimaryLabel')}
        >
          {t(`domain.${primary}`)}
        </span>
      )}
      {hasSubtopics &&
        subtopics!.map((slug) => {
          const axis = getAxis(slug);
          if (!axis) return null;
          return (
            <span
              key={slug}
              className={cn(
                'inline-flex items-center rounded-md px-1.5 py-0.5 font-medium',
                AXIS_COLOR[axis]
              )}
            >
              {t(`domain.${slug}`)}
            </span>
          );
        })}
      {confidence && (
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px]',
            CONFIDENCE_COLOR[confidence]
          )}
          title={t('domainConfidenceLabel')}
        >
          {t(`domainConfidence.${confidence}`)}
        </span>
      )}
    </div>
  );
}
