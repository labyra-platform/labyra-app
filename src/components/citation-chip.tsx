/**
 * CitationChip — inline verified citation badge with DOI link.
 * Only renders if doi is present and verified=true (Trust > Coverage).
 *
 * @phase R183-3-material-knowledge-panel
 */
import { IconExternalLink } from '@tabler/icons-react';
import type { VerifiedCitation } from '@/types/material-profiles';

interface CitationChipProps {
  citation?: VerifiedCitation;
  className?: string;
}

// Journal tier badge color
function journalColor(journal?: string): string {
  if (!journal) return 'bg-muted text-muted-foreground';
  const j = journal.toLowerCase();
  if (j.includes('nature') || j.includes('science') || j.includes('cell'))
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
  if (
    j.includes('nano letters') ||
    j.includes('acs nano') ||
    j.includes('jacs') ||
    j.includes('angewandte') ||
    j.includes('advanced materials')
  )
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
  return 'bg-muted text-muted-foreground';
}

export function CitationChip({ citation, className = '' }: CitationChipProps) {
  if (!citation?.doi || !citation.verified) return null;

  const label = citation.journal
    ? `${citation.journal}${citation.year ? ` ${citation.year}` : ''}`
    : citation.doi;

  return (
    <a
      href={`https://doi.org/${citation.doi}`}
      target='_blank'
      rel='noopener noreferrer'
      title={citation.title ?? citation.doi}
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'text-xs font-medium transition-opacity hover:opacity-80',
        journalColor(citation.journal),
        className
      ].join(' ')}
    >
      {label}
      <IconExternalLink className='h-3 w-3' />
    </a>
  );
}
