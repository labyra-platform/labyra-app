'use client';

/**
 * CitationChip — render source provenance for AI-identified phases.
 * Shows badge with source type (COD/MP/Library/Web/Unverified) + clickable link to DOI or DB entry.
 * @phase R160-spectra-4a
 */

import { IconCircleCheck, IconExternalLink, IconAlertCircle, IconBook } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type CitationSourceType = 'COD' | 'MP' | 'internal' | 'web' | 'unverified';

export interface PhaseSource {
  type: CitationSourceType;
  id: string | null;
  doi?: string | null;
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

function buildEntryUrl(source: PhaseSource): string | null {
  if (!source.id) return null;
  if (source.doi) {
    return `https://doi.org/${source.doi}`;
  }
  switch (source.type) {
    case 'COD':
      return `http://www.crystallography.net/cod/${source.id}.html`;
    case 'MP':
      return `https://next-gen.materialsproject.org/materials/${source.id}`;
    case 'internal':
      // R162-spectra-4b — local route, no target=_blank handling needed below
      return `/dashboard/reference-cards/${source.id}`;
    case 'web':
      return null; // web sources should have explicit URL via doi field
    default:
      return null;
  }
}

export function CitationChip({ source, className }: CitationChipProps) {
  if (!source || !source.type) return null;

  const config = getSourceConfig(source.type);
  const Icon = config.icon;
  const url = buildEntryUrl(source);
  const idDisplay = source.id ?? '—';
  const fullLabel = source.type === 'unverified' ? config.label : `${config.label} · ${idDisplay}`;

  if (url) {
    return (
      <a
        href={url}
        target='_blank'
        rel='noopener noreferrer'
        className={cn(
          'inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
          className
        )}
        title={config.description}
      >
        <Icon className='h-3 w-3' />
        <span className='font-medium'>{fullLabel}</span>
        <IconExternalLink className='h-2.5 w-2.5 opacity-60' />
      </a>
    );
  }

  return (
    <Badge variant={config.variant} className={cn('text-xs', className)} title={config.description}>
      <Icon className='mr-1 h-3 w-3' />
      {fullLabel}
    </Badge>
  );
}
