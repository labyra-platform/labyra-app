'use client';

/**
 * Paper domain filter chips — multi-axis multi-select.
 *
 * Pattern mirrors citation-filter.tsx (R166-6b-2). Controlled component:
 * parent owns DomainFilterValue Set state. Toggle chips grouped by axis.
 *
 * Empty filter Set = pass all papers.
 *
 * @phase R178-3
 * @r178-3-applied
 */
import { IconFilter, IconX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import {
  APPLICATION_SLUGS,
  AXIS_COLOR,
  CHARACTERIZATION_SLUGS,
  type DomainAxis,
  MATERIALS_CLASS_SLUGS,
  META_SLUGS,
  SYNTHESIS_SLUGS
} from '@/features/papers/lib/taxonomy';
import { cn } from '@/lib/utils';

export interface DomainFilterValue {
  selected: Set<string>;
}

export function createEmptyDomainFilter(): DomainFilterValue {
  return { selected: new Set() };
}

interface AxisGroup {
  axis: DomainAxis;
  i18nKey: string;
  slugs: ReadonlyArray<string>;
}

const AXIS_GROUPS: ReadonlyArray<AxisGroup> = [
  { axis: 'application', i18nKey: 'domainAxisApplication', slugs: APPLICATION_SLUGS },
  { axis: 'materials_class', i18nKey: 'domainAxisMaterials', slugs: MATERIALS_CLASS_SLUGS },
  { axis: 'synthesis', i18nKey: 'domainAxisSynthesis', slugs: SYNTHESIS_SLUGS },
  {
    axis: 'characterization',
    i18nKey: 'domainAxisCharacterization',
    slugs: CHARACTERIZATION_SLUGS
  },
  { axis: 'meta', i18nKey: 'domainAxisMeta', slugs: META_SLUGS }
];

interface Props {
  value: DomainFilterValue;
  onChange: (next: DomainFilterValue) => void;
  /** Optional: hide chips for slugs not in this set (compact mode) */
  visibleSlugs?: Set<string>;
}

export function PaperDomainFilter({ value, onChange, visibleSlugs }: Props) {
  const t = useTranslations('papers');

  function toggle(slug: string): void {
    const next = new Set(value.selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange({ selected: next });
  }

  function clear(): void {
    onChange({ selected: new Set() });
  }

  const hasSelection = value.selected.size > 0;

  return (
    <div className='space-y-2 border rounded-lg p-3'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
          <IconFilter className='size-3.5' aria-hidden />
          <span>{t('domainFilterLabel')}</span>
        </div>
        {hasSelection && (
          <button
            type='button'
            onClick={clear}
            className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded'
            aria-label={t('domainFilterClear')}
          >
            <IconX className='size-3' aria-hidden />
            {t('domainFilterClear')} ({value.selected.size})
          </button>
        )}
      </div>

      <div className='space-y-1.5'>
        {AXIS_GROUPS.map(({ axis, i18nKey, slugs }) => {
          const visible = visibleSlugs ? slugs.filter((s) => visibleSlugs.has(s)) : slugs;
          if (visible.length === 0) return null;

          const activeClass = AXIS_COLOR[axis];

          return (
            <div key={axis} className='flex flex-wrap items-center gap-1.5'>
              <span className='text-[10px] uppercase tracking-wide text-muted-foreground w-24 shrink-0'>
                {t(i18nKey)}
              </span>
              {visible.map((slug) => {
                const active = value.selected.has(slug);
                return (
                  <button
                    key={slug}
                    type='button'
                    onClick={() => toggle(slug)}
                    className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? activeClass
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
                    )}
                    aria-pressed={active}
                  >
                    {t(`domain.${slug}`)}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Pure predicate — apply DomainFilterValue to a paper. */
export function paperPassesDomainFilter(
  paper: { domain?: string; subtopics?: string[] },
  filter: DomainFilterValue
): boolean {
  if (filter.selected.size === 0) return true;
  if (paper.domain && filter.selected.has(paper.domain)) return true;
  if (paper.subtopics) {
    for (const s of paper.subtopics) {
      if (filter.selected.has(s)) return true;
    }
  }
  return false;
}
