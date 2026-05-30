'use client';
import { formatSciText } from '@/features/spectra/utils/format-units';
import {
  IconBooks,
  IconCheck,
  IconExternalLink,
  IconQuestionMark,
  IconQuote
} from '@tabler/icons-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
/**
 * Render a single citation entry with confidence badge.
 *
 * Confidence color mapping uses shadcn/Tailwind tokens only (CLAUDE.md rule:
 * no hardcode colors). Each confidence level maps to a semantic intent.
 *
 * @phase R166-6b-1
 */
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Citation, CitationConfidence } from '@/types/citations';

interface ConfidenceStyle {
  badgeClass: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  i18nKey: string;
}

const CONFIDENCE_STYLES: Record<CitationConfidence, ConfidenceStyle> = {
  'doi-exact': {
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    icon: IconCheck,
    i18nKey: 'confidenceDoiExact'
  },
  manual: {
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    icon: IconCheck,
    i18nKey: 'confidenceManual'
  },
  'title-fuzzy': {
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    icon: IconQuote,
    i18nKey: 'confidenceTitleFuzzy'
  },
  unverified: {
    badgeClass: 'bg-muted text-muted-foreground border-border',
    icon: IconQuestionMark,
    i18nKey: 'confidenceUnverified'
  }
};

function formatAuthors(authors: string[] | undefined, maxShown: number = 3): string {
  if (!authors || authors.length === 0) return '';
  if (authors.length <= maxShown) return authors.join(', ');
  return `${authors.slice(0, maxShown).join(', ')} et al.`;
}

export function CitationCard({ citation }: { citation: Citation }) {
  const t = useTranslations('papers');
  const params = useParams();
  const locale = params.locale as string;
  const conf = CONFIDENCE_STYLES[citation.confidence];
  const ConfIcon = conf.icon;

  const title =
    citation.targetTitle ?? citation.targetDoi ?? citation.rawText ?? t('citationUntitled');
  const authors = formatAuthors(citation.targetAuthors);
  const yearJournal = [citation.targetYear, citation.targetJournal].filter(Boolean).join(' · ');

  // Where a click leads: prefer the in-library paper, else the DOI. Either way
  // it opens in a NEW tab so the reader keeps their place in the current PDF.
  const internalHref = citation.targetPaperId
    ? `/${locale}/dashboard/papers/${citation.targetPaperId}`
    : null;
  const doiHref = citation.targetDoi ? `https://doi.org/${citation.targetDoi}` : null;
  const openHref = internalHref ?? doiHref;

  const card = (
    <>
      <div className='flex items-start gap-2.5'>
        {/* Sequence number — order in the reference list, not a citation marker. */}
        {citation.number != null && (
          <span className='mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10.5px] font-medium tabular-nums text-muted-foreground'>
            {citation.number}
          </span>
        )}
        <div className='min-w-0 flex-1 space-y-1'>
          <div className='flex items-start justify-between gap-2'>
            <div className='break-words text-sm font-medium leading-snug'>
              {formatSciText(title)}
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px]',
                conf.badgeClass
              )}
              title={t(conf.i18nKey)}
            >
              <ConfIcon className='size-3' aria-hidden />
              {t(conf.i18nKey)}
            </span>
          </div>

          {authors && <div className='break-words text-xs text-muted-foreground'>{authors}</div>}
          {yearJournal && <div className='text-xs text-muted-foreground'>{yearJournal}</div>}

          <div className='flex items-center gap-2 pt-0.5'>
            {citation.targetPaperId && (
              <span className='inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-400'>
                <IconBooks className='size-3' aria-hidden />
                {t('inLibrary')}
              </span>
            )}
            {citation.targetDoi && (
              <span className='truncate text-[11px] text-muted-foreground/80'>
                {citation.targetDoi}
              </span>
            )}
            {openHref && (
              <IconExternalLink
                className='ml-auto size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover/cite:text-foreground'
                aria-hidden
              />
            )}
          </div>
        </div>
      </div>
    </>
  );

  const baseClass = 'group/cite block rounded-md border p-3 text-left transition-colors';

  // Clickable whole-card when there's somewhere to go; in-library uses an SPA
  // link (new tab), external DOI a plain anchor (new tab).
  if (internalHref) {
    return (
      <Link
        href={internalHref}
        target='_blank'
        rel='noopener noreferrer'
        className={cn(baseClass, 'hover:border-primary/40 hover:bg-muted/40')}
        title={t('openInNewTab')}
      >
        {card}
      </Link>
    );
  }
  if (doiHref) {
    return (
      <a
        href={doiHref}
        target='_blank'
        rel='noopener noreferrer'
        className={cn(baseClass, 'hover:border-primary/40 hover:bg-muted/40')}
        title={t('openDoiNewTab')}
      >
        {card}
      </a>
    );
  }
  return <div className={cn(baseClass, 'cursor-default')}>{card}</div>;
}
