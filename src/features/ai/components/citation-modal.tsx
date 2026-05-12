'use client';
/**
 * Citation modal — appears when user clicks a citation chip.
 * Renders full source detail: paper info + chunk text + DOI link + score.
 * @phase R160-ai-5d-3b
 */
import { useEffect } from 'react';
import { IconX, IconExternalLink, IconFileText } from '@tabler/icons-react';
import type { SourceHit } from './sources-panel';

interface CitationModalProps {
  source: SourceHit | null;
  onClose: () => void;
}

export function CitationModal({ source, onClose }: CitationModalProps) {
  // ESC to close
  useEffect(() => {
    if (!source) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    // Prevent body scroll while modal open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = originalOverflow;
    };
  }, [source, onClose]);

  if (!source) return null;

  const pagesLabel = source.pages.length > 0 ? `p. ${source.pages.join(', ')}` : null;
  const authorsLabel =
    source.paperAuthors.length > 0 && source.paperAuthors[0] !== 'unknown'
      ? source.paperAuthors.slice(0, 3).join(', ') +
        (source.paperAuthors.length > 3 ? ' et al.' : '')
      : null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm'
      onClick={(e) => {
        // Close when click overlay (but not modal content)
        if (e.target === e.currentTarget) onClose();
      }}
      role='dialog'
      aria-modal='true'
      aria-labelledby='citation-modal-title'
    >
      <div className='relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border bg-card shadow-xl'>
        {/* Header */}
        <div className='sticky top-0 z-10 flex items-start gap-3 border-b bg-card px-5 py-4'>
          <span className='shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary text-sm font-semibold border border-primary/20'>
            {source.ref}
          </span>
          <div className='flex-1 min-w-0'>
            <h3 id='citation-modal-title' className='text-base font-semibold leading-snug'>
              {source.paperTitle || 'Untitled'}
            </h3>
            <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
              {authorsLabel && <span>{authorsLabel}</span>}
              {source.paperYear > 0 && (
                <>
                  {authorsLabel && <span className='text-muted-foreground/50'>·</span>}
                  <span>{source.paperYear}</span>
                </>
              )}
              {source.section && (
                <>
                  <span className='text-muted-foreground/50'>·</span>
                  <span className='inline-flex items-center gap-1'>
                    <IconFileText size={12} />
                    {source.section}
                  </span>
                </>
              )}
              {pagesLabel && (
                <>
                  <span className='text-muted-foreground/50'>·</span>
                  <span>{pagesLabel}</span>
                </>
              )}
            </div>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors'
            aria-label='Close'
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Body */}
        <div className='px-5 py-4'>
          <div className='mb-3 flex items-center gap-2 text-xs text-muted-foreground'>
            <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400 font-medium'>
              <span className='size-1.5 rounded-full bg-emerald-500' />
              Relevance {(source.score * 100).toFixed(0)}%
            </span>
          </div>
          <div className='prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed'>
            {source.excerpt}
          </div>
        </div>

        {/* Footer with DOI link */}
        {source.paperDoi && (
          <div className='sticky bottom-0 border-t bg-card px-5 py-3'>
            <a
              href={`https://doi.org/${source.paperDoi}`}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1.5 text-sm text-primary hover:underline'
            >
              <IconExternalLink size={14} />
              View full paper at doi.org/{source.paperDoi}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
