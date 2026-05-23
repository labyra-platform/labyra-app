'use client';
import { IconChevronDown, IconChevronRight, IconFileText } from '@tabler/icons-react';
/**
 * Sources panel — collapsible list of retrieved chunks.
 * Auto-expanded by default (NotebookLM pattern).
 * @phase R160-ai-5d-3
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface SourceHit {
  ref: number;
  paperId: string;
  paperTitle: string;
  paperAuthors: string[];
  paperYear: number;
  paperDoi: string;
  pages: number[];
  section: string;
  excerpt: string;
  score: number;
}

interface SourcesPanelProps {
  sources: SourceHit[];
  /** Highlighted ref (when user clicked a chip) */
  highlightedRef?: number | null;
  /** Locale prefix for paper links */
  locale?: string;
}

export function SourcesPanel({
  sources,
  highlightedRef,
  locale: _locale = 'en'
}: SourcesPanelProps) {
  const [expanded, setExpanded] = useState(true); // auto-expanded default

  if (sources.length === 0) return null;

  return (
    <div className='mt-3 rounded-lg border bg-muted/30'>
      <button
        type='button'
        onClick={() => setExpanded((e) => !e)}
        className='flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors'
      >
        {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        <IconFileText size={16} className='text-muted-foreground' />
        <span>
          {sources.length} {sources.length === 1 ? 'source' : 'sources'}
        </span>
      </button>

      {expanded && (
        <ol className='space-y-2 px-3 pb-3'>
          {sources.map((s) => {
            const isHighlighted = highlightedRef === s.ref;
            const pagesLabel = s.pages.length > 0 ? `p. ${s.pages.join(', ')}` : '';
            const authorsLabel =
              s.paperAuthors.length > 0 && s.paperAuthors[0] !== 'unknown'
                ? s.paperAuthors.slice(0, 2).join(', ') +
                  (s.paperAuthors.length > 2 ? ' et al.' : '')
                : '';
            return (
              <li
                key={`${s.paperId}-${s.ref}`}
                id={`source-${s.ref}`}
                className={cn(
                  'rounded-md border bg-background p-3 transition-all',
                  isHighlighted && 'ring-2 ring-primary border-primary'
                )}
              >
                <div className='flex items-start gap-2'>
                  <span className='shrink-0 inline-flex items-center justify-center min-w-[1.6em] h-[1.6em] rounded-md bg-primary/10 text-primary text-xs font-medium border border-primary/20'>
                    {s.ref}
                  </span>
                  <div className='flex-1 min-w-0'>
                    <div className='text-sm font-medium leading-snug'>
                      {s.paperTitle || 'Untitled'}
                    </div>
                    <div className='mt-0.5 text-xs text-muted-foreground'>
                      {[authorsLabel, s.paperYear > 0 ? s.paperYear : null, s.section, pagesLabel]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className='mt-2 text-sm text-muted-foreground line-clamp-3 leading-relaxed'>
                      {s.excerpt}
                    </div>
                    {s.paperDoi && (
                      <a
                        href={`https://doi.org/${s.paperDoi}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='mt-1 inline-block text-xs text-primary hover:underline'
                      >
                        doi.org/{s.paperDoi}
                      </a>
                    )}
                  </div>
                  <span className='shrink-0 text-xs text-muted-foreground'>
                    {(s.score * 100).toFixed(0)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
