'use client';
import { IconCheck, IconLibrary, IconQuestionMark, IconQuote } from '@tabler/icons-react';
/**
 * Citation filter — controlled component.
 *
 * Two axes:
 *   - confidence: multi-select chip toggle for each level
 *   - inLibraryOnly: toggle to show only citations with targetPaperId resolved
 *
 * Pure controlled — parent owns CitationFilterValue state.
 *
 * @phase R166-6b-2
 */
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { CitationConfidence } from '@/types/citations';

export interface CitationFilterValue {
  confidences: Set<CitationConfidence>;
  inLibraryOnly: boolean;
}

export const ALL_CONFIDENCES: ReadonlyArray<CitationConfidence> = [
  'doi-exact',
  'manual',
  'title-fuzzy',
  'unverified'
];

export function createDefaultFilter(): CitationFilterValue {
  // R224b: default to the most trustworthy view — DOI-verified citations that are
  // already in the lab's library. The user can widen to manual/title-match/
  // unverified as needed. Aligns with Trust > Coverage.
  return {
    confidences: new Set<CitationConfidence>(['doi-exact']),
    inLibraryOnly: true
  };
}

const CONFIDENCE_META: Record<
  CitationConfidence,
  {
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
    activeClass: string;
    i18nKey: string;
  }
> = {
  'doi-exact': {
    icon: IconCheck,
    activeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
    i18nKey: 'confidenceDoiExact'
  },
  manual: {
    icon: IconCheck,
    activeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/40',
    i18nKey: 'confidenceManual'
  },
  'title-fuzzy': {
    icon: IconQuote,
    activeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40',
    i18nKey: 'confidenceTitleFuzzy'
  },
  unverified: {
    icon: IconQuestionMark,
    activeClass: 'bg-foreground/5 text-foreground border-foreground/30',
    i18nKey: 'confidenceUnverified'
  }
};

interface Props {
  value: CitationFilterValue;
  onChange: (next: CitationFilterValue) => void;
}

export function CitationFilter({ value, onChange }: Props) {
  const t = useTranslations('papers');

  function toggleConfidence(level: CitationConfidence) {
    const next = new Set(value.confidences);
    if (next.has(level)) {
      next.delete(level);
    } else {
      next.add(level);
    }
    onChange({ ...value, confidences: next });
  }

  function toggleInLibrary() {
    onChange({ ...value, inLibraryOnly: !value.inLibraryOnly });
  }

  return (
    <div className='flex flex-wrap items-center gap-1.5 text-xs'>
      <span className='text-muted-foreground mr-1'>{t('filterLabel')}</span>

      {ALL_CONFIDENCES.map((level) => {
        const meta = CONFIDENCE_META[level];
        const Icon = meta.icon;
        const active = value.confidences.has(level);
        return (
          <button
            key={level}
            type='button'
            onClick={() => toggleConfidence(level)}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors',
              active
                ? meta.activeClass
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
            )}
            aria-pressed={active}
          >
            <Icon className='size-3' aria-hidden />
            {t(meta.i18nKey)}
          </button>
        );
      })}

      <button
        type='button'
        onClick={toggleInLibrary}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors ml-1',
          value.inLibraryOnly
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
            : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
        )}
        aria-pressed={value.inLibraryOnly}
        title={t('filterInLibraryHint')}
      >
        <IconLibrary className='size-3' aria-hidden />
        {t('filterInLibrary')}
      </button>
    </div>
  );
}

/**
 * Pure filter predicate — apply CitationFilterValue to a single citation.
 * Exported for reuse + unit-testability.
 */
export function citationPassesFilter(
  c: { confidence: CitationConfidence; targetPaperId?: string | null },
  filter: CitationFilterValue
): boolean {
  if (!filter.confidences.has(c.confidence)) return false;
  if (filter.inLibraryOnly && !c.targetPaperId) return false;
  return true;
}
