'use client';
import { formatSciNode } from '@/features/spectra/utils/format-units';
import {
  IconCheck,
  IconExternalLink,
  IconQuestionMark,
  IconQuote,
  IconSearch
} from '@tabler/icons-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
/**
 * Render a single citation entry, compact (R237cn): the cited paper's TITLE
 * (truncated to 2 lines) with a small confidence icon, then one muted line of
 * "first-author et al · year · journal". The DOI is no longer shown as text and
 * is never run through formatSciNode (which would subscript DOI digits).
 *
 * @phase R166-6b-1 base, R237cn compact redesign
 */
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cleanText } from '@/lib/utils/normalize-text';
import type { Citation, CitationConfidence } from '@/types/citations';

interface ConfidenceStyle {
  iconClass: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  i18nKey: string;
}

const CONFIDENCE_STYLES: Record<CitationConfidence, ConfidenceStyle> = {
  'doi-exact': {
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    icon: IconCheck,
    i18nKey: 'confidenceDoiExact'
  },
  manual: {
    iconClass: 'text-blue-600 dark:text-blue-400',
    icon: IconCheck,
    i18nKey: 'confidenceManual'
  },
  'title-fuzzy': {
    iconClass: 'text-amber-600 dark:text-amber-400',
    icon: IconQuote,
    i18nKey: 'confidenceTitleFuzzy'
  },
  unverified: {
    iconClass: 'text-muted-foreground/60',
    icon: IconQuestionMark,
    i18nKey: 'confidenceUnverified'
  }
};

function formatAuthors(authors: string[] | undefined, maxShown: number = 1): string {
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

  // R237cn: prefer the cited paper's resolved TITLE (formatSciNode only on a real
  // title so "TiO2"→"TiO₂"). R314: when a title couldn't be resolved, show the DOI
  // (identifiable, links out) instead of a bare "Untitled" — rendered plain so its
  // digits never get subscripted. citationUntitled only when neither is present.
  const realTitle = cleanText(citation.targetTitle);
  const displayTitle = realTitle || citation.targetDoi?.trim() || t('citationUntitled');
  // First author + et al · year · journal — all on one line.
  const meta = [formatAuthors(citation.targetAuthors), citation.targetYear, citation.targetJournal]
    .filter(Boolean)
    .join(' · ');

  // Where a click leads: prefer the in-library paper, else the DOI. Either way
  // it opens in a NEW tab so the reader keeps their place in the current PDF.
  const internalHref = citation.targetPaperId
    ? `/${locale}/dashboard/papers/${citation.targetPaperId}`
    : null;
  const doiHref = citation.targetDoi ? `https://doi.org/${citation.targetDoi}` : null;
  // Non-DOI references (books, conference proceedings, theses) can't deep-link.
  // Fall back to a Google Scholar title search so EVERY entry stays actionable
  // instead of a dead end.
  const scholarHref =
    !internalHref && !doiHref && realTitle
      ? `https://scholar.google.com/scholar?q=${encodeURIComponent(realTitle)}`
      : null;
  const openHref = internalHref ?? doiHref ?? scholarHref;
  // A DOI / in-library link opens the paper directly; the Scholar fallback is a
  // SEARCH, so signal that honestly with a magnifier rather than the link glyph.
  const OpenIcon = scholarHref ? IconSearch : IconExternalLink;

  const card = (
    <div className='flex items-start gap-2'>
      {/* Sequence number — order in the reference list, not a citation marker. */}
      {citation.number != null && (
        <span className='mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium tabular-nums text-muted-foreground'>
          {citation.number}
        </span>
      )}
      <div className='min-w-0 flex-1'>
        <div className='flex items-start gap-1.5'>
          <span className='line-clamp-2 flex-1 text-[13px] font-medium leading-snug'>
            {realTitle ? formatSciNode(displayTitle) : displayTitle}
          </span>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className='mt-px shrink-0' aria-label={t(conf.i18nKey)}>
                  <ConfIcon className={cn('size-3.5', conf.iconClass)} aria-hidden />
                </span>
              </TooltipTrigger>
              <TooltipContent side='top' className='max-w-[240px]'>
                <p className='font-medium'>{t(conf.i18nKey)}</p>
                <p className='text-muted-foreground mt-0.5'>{t(`${conf.i18nKey}Tip`)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {openHref && (
            <OpenIcon
              className='mt-px size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover/cite:text-foreground'
              aria-hidden
            />
          )}
        </div>
        {meta && <div className='mt-0.5 truncate text-[11px] text-muted-foreground'>{meta}</div>}
      </div>
    </div>
  );

  const baseClass = 'group/cite block rounded-md border px-2.5 py-1.5 text-left transition-colors';

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
  if (scholarHref) {
    return (
      <a
        href={scholarHref}
        target='_blank'
        rel='noopener noreferrer'
        className={cn(baseClass, 'hover:border-primary/40 hover:bg-muted/40')}
        title={t('searchScholar')}
      >
        {card}
      </a>
    );
  }
  return <div className={cn(baseClass, 'cursor-default')}>{card}</div>;
}
