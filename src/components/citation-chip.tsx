/**
 * CitationChip — inline verified citation badge with DOI link.
 * Only renders if doi is present and verified=true (Trust > Coverage).
 *
 * Color tokens chosen for WCAG AA contrast (≥ 4.5:1):
 * - tier-1 (Nature/Science/Cell): primary tone
 * - tier-2 (top journals): accent tone
 * - default: muted
 *
 * @phase R183-3-hotfix1-ui-ux
 */
import { IconExternalLink } from '@tabler/icons-react';
import type { VerifiedCitation } from '@/types/material-profiles';

interface CitationChipProps {
  citation?: VerifiedCitation;
  className?: string;
}

type JournalTier = 1 | 2 | 3;

function getJournalTier(journal?: string): JournalTier {
  if (!journal) return 3;
  const j = journal.toLowerCase();
  // Tier 1: Nature/Science/Cell family
  if (j.startsWith('nature') || j.startsWith('science') || j === 'cell' || j.startsWith('cell '))
    return 1;
  // Tier 2: top materials/chemistry journals
  if (
    j.includes('nano letters') ||
    j.includes('acs nano') ||
    j.includes('jacs') ||
    j.includes('journal of the american chemical society') ||
    j.includes('angewandte') ||
    j.includes('advanced materials') ||
    j.includes('physical review letters') ||
    j.startsWith('prl')
  )
    return 2;
  return 3;
}

const TIER_STYLES: Record<JournalTier, string> = {
  // WCAG AA compliant — using shadcn semantic tokens that adapt to light/dark
  1: 'bg-primary/15 text-primary border border-primary/20',
  2: 'bg-accent text-accent-foreground border border-border',
  3: 'bg-muted text-muted-foreground border border-border'
};

export function CitationChip({ citation, className = '' }: CitationChipProps) {
  if (!citation?.doi || !citation.verified) return null;

  const tier = getJournalTier(citation.journal);
  const label = citation.journal
    ? `${citation.journal}${citation.year ? ` ${citation.year}` : ''}`
    : citation.doi;

  return (
    <a
      href={`https://doi.org/${citation.doi}`}
      target='_blank'
      rel='noopener noreferrer'
      aria-label={`Citation: ${citation.title ?? citation.doi}. Opens in new tab.`}
      title={citation.title ?? citation.doi}
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'text-xs font-medium',
        'transition-opacity duration-150 motion-reduce:transition-none',
        'hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        TIER_STYLES[tier],
        className
      ].join(' ')}
    >
      {label}
      <IconExternalLink className='h-3 w-3' aria-hidden='true' />
    </a>
  );
}
