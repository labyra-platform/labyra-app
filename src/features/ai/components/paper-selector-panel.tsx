'use client';

import {
  IconCheck,
  IconFile,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconLoader2,
  IconSearch,
  IconX
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { usePapers } from '@/lib/firestore/queries/papers';
import { cn } from '@/lib/utils';
import { useSelectedPapers, PAPER_SELECT_MAX } from '../hooks/use-selected-papers';

const STORAGE_KEY = 'labyra:paperSelector:open';

interface PaperSelectorPanelProps {
  conversationId: string | null;
  initialSelectedIds: readonly string[] | undefined;
}

export function PaperSelectorPanel({
  conversationId,
  initialSelectedIds
}: PaperSelectorPanelProps) {
  const t = useTranslations('ai');
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');

  const { papers, loading: papersLoading } = usePapers();
  const { selected, toggle, clear, saving, error, maxReached } = useSelectedPapers(
    conversationId,
    initialSelectedIds
  );

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setIsOpen(stored === 'true');
    setMounted(true);
  }, []);

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? papers
      : papers.filter((p) => {
          const hay = `${p.title} ${(p.authors ?? []).join(' ')}`.toLowerCase();
          return hay.includes(q);
        });
    return [...filtered].toSorted((a, b) => {
      const aSel = selected.has(a.id) ? 0 : 1;
      const bSel = selected.has(b.id) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [papers, query, selected]);

  if (!mounted) return null;

  return (
    <aside
      className={cn(
        'flex min-h-0 shrink-0 flex-col border-l bg-background transition-[width] duration-200 ease-in-out',
        isOpen ? 'w-80' : 'w-12'
      )}
      aria-label={t('paperSelectorLabel')}
    >
      <header className='flex h-12 items-center justify-between gap-2 border-b px-2'>
        {isOpen && (
          <div className='flex min-w-0 flex-1 items-center gap-2'>
            <h2 className='truncate text-sm font-medium'>{t('paperSelectorTitle')}</h2>
            <Badge variant='secondary' className='shrink-0'>
              {selected.size}/{PAPER_SELECT_MAX}
            </Badge>
          </div>
        )}
        <Button
          variant='ghost'
          size='icon'
          onClick={toggleOpen}
          aria-label={isOpen ? t('collapsePanel') : t('expandPanel')}
          className='shrink-0'
        >
          {isOpen ? <IconLayoutSidebarRightCollapse /> : <IconLayoutSidebarRightExpand />}
        </Button>
      </header>

      {isOpen && !conversationId && (
        <div className='px-3 py-6 text-center'>
          <p className='text-sm text-muted-foreground'>{t('paperSelectorStartConversation')}</p>
        </div>
      )}

      {isOpen && conversationId && (
        <>
          <div className='space-y-2 border-b p-2'>
            <div className='relative'>
              <IconSearch className='absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                type='search'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('paperSelectorSearchPlaceholder')}
                className='pl-8'
                aria-label={t('paperSelectorSearchPlaceholder')}
              />
            </div>
            <div className='flex items-center justify-between text-xs text-muted-foreground'>
              <span>
                {selected.size > 0
                  ? t('paperSelectorScoped', { count: selected.size })
                  : t('paperSelectorAllScope')}
              </span>
              {selected.size > 0 && (
                <Button variant='ghost' size='sm' onClick={clear} className='h-6 px-2 text-xs'>
                  <IconX data-icon='inline-start' />
                  {t('paperSelectorClear')}
                </Button>
              )}
            </div>
            {(saving || error) && (
              <div
                className={cn(
                  'flex items-center gap-1.5 text-xs',
                  error ? 'text-destructive' : 'text-muted-foreground'
                )}
                role='status'
                aria-live='polite'
              >
                {saving && (
                  <>
                    <IconLoader2 className='size-3 animate-spin' />
                    <span>{t('paperSelectorSaving')}</span>
                  </>
                )}
                {error && <span>{error}</span>}
              </div>
            )}
          </div>

          <ScrollArea className='h-0 flex-1'>
            <div className='space-y-1 p-2'>
              {papersLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className='h-14 w-full rounded-md' />
                ))}

              {!papersLoading && displayed.length === 0 && (
                <div className='flex flex-col items-center gap-2 py-8 text-center'>
                  <IconFile className='size-6 text-muted-foreground' />
                  <p className='text-sm text-muted-foreground'>
                    {query ? t('paperSelectorNoMatch') : t('paperSelectorEmpty')}
                  </p>
                </div>
              )}

              {!papersLoading &&
                displayed.map((paper) => {
                  const isSelected = selected.has(paper.id);
                  const disabledNotSelected = !isSelected && maxReached;
                  return (
                    <button
                      key={paper.id}
                      type='button'
                      onClick={() => toggle(paper.id)}
                      disabled={disabledNotSelected}
                      aria-pressed={isSelected}
                      className={cn(
                        'group flex w-full items-start gap-2 rounded-md border p-2 text-left transition-colors',
                        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isSelected && 'border-primary bg-primary/5',
                        disabledNotSelected && 'cursor-not-allowed opacity-40'
                      )}
                    >
                      <div
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input'
                        )}
                        aria-hidden
                      >
                        {isSelected && <IconCheck className='size-3' />}
                      </div>
                      <div className='min-w-0 flex-1'>
                        <p className='line-clamp-2 text-sm font-medium leading-snug'>
                          {paper.title || t('untitled')}
                        </p>
                        <p className='mt-0.5 truncate text-xs text-muted-foreground'>
                          {(paper.authors ?? []).slice(0, 2).join(', ') || t('unknownAuthors')}
                          {paper.year ? ` · ${paper.year}` : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}
