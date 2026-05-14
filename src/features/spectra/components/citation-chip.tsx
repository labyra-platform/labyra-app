'use client';

/**
 * CitationChip — render source provenance for AI-identified phases.
 * Shows badge with source type (COD/MP/Library/Web/Unverified) + clickable link.
 *
 * R164-phase-10: when source.type='internal' AND source.paperId is set,
 * the chip links to the internal Paper detail page instead of an external URL.
 * @phase R164-phase-10 (was R160-spectra-4a)
 */

import { useLocale } from 'next-intl';
import Link from 'next/link';
import { IconCircleCheck, IconExternalLink, IconAlertCircle, IconBook } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type CitationSourceType = 'COD' | 'MP' | 'internal' | 'web' | 'unverified';

export interface PhaseSource {
  type: CitationSourceType;
  id: string | null;
  doi?: string | null;
  /** R164: Reference.paperId → links to /dashboard/papers/{id} (internal nav). */
  paperId?: string | null;
}

interface CitationChipProps {
  source: PhaseSource | null | undefined;
  className?: string;
}

function getSourceConfig(type: CitationSourceType): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: typeof IconCircleCheck;
  description: string;
} {
  switch (type) {
    case 'COD':
      return {
        label: 'COD',
        variant: 'default',
        icon: IconCircleCheck,
        description: 'Crystallography Open Database'
      };
    case 'MP':
      return {
        label: 'MP',
        variant: 'default',
        icon: IconCircleCheck,
        description: 'Materials Project'
      };
    case 'internal':
      return {
        label: 'Library',
        variant: 'secondary',
        icon: IconBook,
        description: 'Internal reference library'
      };
    case 'web':
      return {
        label: 'Web',
        variant: 'secondary',
        icon: IconExternalLink,
        description: 'Web search result'
      };
    case 'unverified':
    default:
      return {
        label: 'Unverified',
        variant: 'outline',
        icon: IconAlertCircle,
        description: 'No citation match — AI inference only'
      };
  }
}

interface ResolvedUrl {
  href: string;
  external: boolean;
}

function buildEntryUrl(source: PhaseSource, locale: string): ResolvedUrl | null {
  // R164: internal Reference with linked Paper → internal nav, top priority
  if (source.type === 'internal' && source.paperId) {
    return { href: `/${locale}/dashboard/papers/${source.paperId}`, external: false };
  }
  if (!source.id) return null;
  if (source.doi) {
    return { href: `https://doi.org/${source.doi}`, external: true };
  }
  switch (source.type) {
    case 'COD':
      return {
        href: `http://www.crystallography.net/cod/${source.id}.html`,
        external: true
      };
    case 'MP':
      return {
        href: `https://materialsproject.org/materials/${source.id}`,
        external: true
      };
    case 'internal':
      // Internal ref WITHOUT paperId: link to reference-cards detail page
      return {
        href: `/${locale}/dashboard/reference-cards/${source.id}`,
        external: false
      };
    default:
      return null;
  }
}

export function CitationChip({ source, className }: CitationChipProps) {
  const locale = useLocale();
  if (!source || !source.type) return null;

  const config = getSourceConfig(source.type);
  const Icon = config.icon;
  const url = buildEntryUrl(source, locale);
  const idDisplay = source.id ?? '—';
  const fullLabel = source.type === 'unverified' ? config.label : `${config.label} · ${idDisplay}`;

  if (url) {
    const chipClass = cn(
      'inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
      className
    );
    const innerContent = (
      <>
        <Icon className='h-3 w-3' />
        <span className='font-medium'>{fullLabel}</span>
        {url.external ? <IconExternalLink className='h-2.5 w-2.5 opacity-60' /> : null}
      </>
    );
    if (url.external) {
      return (
        <a
          href={url.href}
          target='_blank'
          rel='noopener noreferrer'
          className={chipClass}
          title={config.description}
        >
          {innerContent}
        </a>
      );
    }
    // Internal nav — use Next Link for client-side routing
    return (
      <Link href={url.href} className={chipClass} title={config.description}>
        {innerContent}
      </Link>
    );
  }

  return (
    <Badge variant={config.variant} className={cn('text-xs', className)} title={config.description}>
      <Icon className='mr-1 h-3 w-3' />
      {fullLabel}
    </Badge>
  );
}
