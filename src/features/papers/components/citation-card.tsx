'use client';
/**
 * Render a single citation entry with confidence badge.
 *
 * Confidence color mapping uses shadcn/Tailwind tokens only (CLAUDE.md rule:
 * no hardcode colors). Each confidence level maps to a semantic intent.
 *
 * @phase R166-6b-1
 */
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { IconExternalLink, IconQuote, IconCheck, IconQuestionMark } from '@tabler/icons-react';
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

  const title = citation.targetTitle ?? citation.targetDoi ?? t('citationUntitled');
  const authors = formatAuthors(citation.targetAuthors);
  const yearJournal = [citation.targetYear, citation.targetJournal].filter(Boolean).join(' · ');

  // Internal link if target paper resolved in our DB
  const internalHref = citation.targetPaperId
    ? `/${locale}/dashboard/papers/${citation.targetPaperId}`
    : null;

  // External DOI link
  const doiHref = citation.targetDoi ? `https://doi.org/${citation.targetDoi}` : null;

  return (
    <div className='border rounded-md p-3 space-y-1.5 text-sm'>
      <div className='flex items-start justify-between gap-2'>
        <div className='flex-1 min-w-0'>
          {internalHref ? (
            <Link
              href={internalHref}
              className='font-medium hover:underline break-words inline-block'
            >
              {title}
            </Link>
          ) : (
            <div className='font-medium break-words'>{title}</div>
          )}
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border shrink-0',
            conf.badgeClass
          )}
          title={t(conf.i18nKey)}
        >
          <ConfIcon className='size-3' aria-hidden />
          {t(conf.i18nKey)}
        </span>
      </div>

      {authors && <div className='text-muted-foreground text-xs break-words'>{authors}</div>}

      {yearJournal && <div className='text-muted-foreground text-xs'>{yearJournal}</div>}

      {citation.targetDoi && (
        <div className='flex items-center gap-2 pt-0.5'>
          {doiHref && (
            <a
              href={doiHref}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
            >
              <IconExternalLink className='size-3' aria-hidden />
              {citation.targetDoi}
            </a>
          )}
          {citation.targetPaperId && (
            <span className='text-xs text-emerald-600 dark:text-emerald-400'>{t('inLibrary')}</span>
          )}
        </div>
      )}
    </div>
  );
}
