'use client';
import { IconExternalLink, IconFileText } from '@tabler/icons-react';
/**
 * Citation modal — appears when the user clicks a citation chip. Shows full
 * source detail (paper info + chunk + relevance + DOI) inside a shadcn Dialog
 * (focus-trap, ESC, overlay-close, scroll-lock all handled by Radix).
 * @phase R160-ai-5d-3b · R256 shadcn Dialog
 */
import { useEffect, useState } from 'react';
import { cleanExcerpt } from '../lib/sanitize-vi-math';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { SourceHit } from './sources-panel';

interface CitationModalProps {
  source: SourceHit | null;
  /** Number shown in the header (Vancouver order-of-appearance). Falls back to source.ref. */
  displayRef?: number;
  onClose: () => void;
}

export function CitationModal({ source, displayRef, onClose }: CitationModalProps) {
  // Retain the last source so the content stays rendered during the Dialog's
  // close animation (open flips to false before the parent clears the ref).
  const [shown, setShown] = useState<{ source: SourceHit; displayRef?: number } | null>(
    source ? { source, displayRef } : null
  );
  useEffect(() => {
    if (source) setShown({ source, displayRef });
  }, [source, displayRef]);

  const s = shown?.source ?? null;
  const pagesLabel = s && s.pages.length > 0 ? `p. ${s.pages.join(', ')}` : null;
  const authorsLabel =
    s && s.paperAuthors.length > 0 && s.paperAuthors[0] !== 'unknown'
      ? s.paperAuthors.slice(0, 3).join(', ') + (s.paperAuthors.length > 3 ? ' et al.' : '')
      : null;

  return (
    <Dialog
      open={!!source}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className='max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl'
      >
        {s && (
          <>
            {/* Header */}
            <div className='bg-background sticky top-0 z-10 flex items-start gap-3 border-b px-5 py-4 pr-12'>
              <span className='border-primary/20 bg-primary/10 text-primary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-sm font-semibold'>
                {shown?.displayRef ?? s.ref}
              </span>
              <div className='min-w-0 flex-1'>
                <DialogTitle className='text-base leading-snug'>
                  {s.paperTitle || 'Untitled'}
                </DialogTitle>
                <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
                  {authorsLabel && <span>{authorsLabel}</span>}
                  {s.paperYear > 0 && (
                    <>
                      {authorsLabel && <span className='text-muted-foreground/50'>·</span>}
                      <span>{s.paperYear}</span>
                    </>
                  )}
                  {s.section && (
                    <>
                      <span className='text-muted-foreground/50'>·</span>
                      <span className='inline-flex items-center gap-1'>
                        <IconFileText size={12} />
                        {s.section}
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
            </div>

            {/* Body */}
            <div className='px-5 py-4'>
              <div className='text-muted-foreground mb-3 flex items-center gap-2 text-xs'>
                <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400'>
                  <span className='size-1.5 rounded-full bg-emerald-500' />
                  Relevance {s.score != null ? `${(s.score * 100).toFixed(0)}%` : '—'}
                </span>
              </div>
              <div className='lb-md text-sm leading-relaxed'>{cleanExcerpt(s.excerpt)}</div>
            </div>

            {/* Footer with DOI link */}
            {s.paperDoi && (
              <div className='bg-background sticky bottom-0 border-t px-5 py-3'>
                <a
                  href={`https://doi.org/${s.paperDoi}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-primary inline-flex items-center gap-1.5 text-sm hover:underline'
                >
                  <IconExternalLink size={14} />
                  View full paper at doi.org/{s.paperDoi}
                </a>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
