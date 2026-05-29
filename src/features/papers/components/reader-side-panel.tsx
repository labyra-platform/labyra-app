'use client';

/**
 * Reader side panel — persistent across paper switches.
 *
 * Lives at the PapersWorkspace level (not inside PaperReadView), so when the
 * user switches from paper A to paper B the right column stays open and the
 * active tab is preserved. Each paper still gets its own Q&A history because
 * AskAiTab is keyed by paperId — it remounts to load the right thread, but the
 * container around it doesn't blink or close.
 *
 * Owns:
 *   - panelOpen + collapse handle
 *   - the tab strip (Info / Citations / Ask AI)
 *   - tab body switching
 *   - jumpRequest forwarded up to the workspace so PdfViewer can react
 *
 * @phase R237an
 */
import {
  IconChevronRight,
  IconExternalLink,
  IconHighlight,
  IconInfoCircle,
  IconQuote,
  IconSparkles,
  IconTrash
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AXIS_COLOR, getAxis } from '@/features/papers/lib/taxonomy';
import { useTenantId } from '@/lib/auth/use-claims';
import { deleteAnnotation, subscribeAnnotations } from '@/lib/firestore/queries/annotations';
import { usePaper } from '@/lib/firestore/queries/papers';
import { cn } from '@/lib/utils';
import type { HighlightAnnotation } from '@/types/annotations';
import { HIGHLIGHT_FILL } from '@/types/annotations';
import type { Paper } from '@/types/papers';
import { AskAiTab } from './ask-ai-tab';
import { CitationsSection } from './citations-section';

const AXIS_ORDER: { axis: ReturnType<typeof getAxis>; labelKey: string }[] = [
  { axis: 'application', labelKey: 'axisApplication' },
  { axis: 'materials_class', labelKey: 'axisMaterials' },
  { axis: 'synthesis', labelKey: 'axisSynthesis' },
  { axis: 'characterization', labelKey: 'axisCharacterization' },
  { axis: 'meta', labelKey: 'axisMeta' }
];

function formatAuthors(authors: string[] | undefined): string {
  if (!authors || authors.length === 0) return '';
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors[0]} et al.`;
}

interface ReaderSidePanelProps {
  paperId: string;
  /** Called when an Ask AI citation chip is clicked; the workspace forwards
   *  it down to the active PdfViewer via PaperReadView's jumpRequest prop. */
  onJumpToPage: (page: number) => void;
}

export function ReaderSidePanel({ paperId, onJumpToPage }: ReaderSidePanelProps) {
  const t = useTranslations('papers');
  const { paper, loading } = usePaper(paperId);

  // R237ao: the active tab is workspace-level, not per-paper. The user expects
  // "I was on Ask AI, I switch papers, I'm still on Ask AI". Since this panel
  // doesn't remount on paper switch (it lives above PaperReadView and isn't
  // keyed), a local state survives the switch — exactly the desired behaviour.
  const [panelTab, setPanelTab] = useState<'info' | 'citations' | 'highlights' | 'ai'>('info');

  const [panelOpen, setPanelOpen] = useState(false);
  const togglePanel = useCallback(() => setPanelOpen((v) => !v), []);
  const switchPanelTab = useCallback((next: 'info' | 'citations' | 'highlights' | 'ai') => {
    setPanelTab(next);
    setPanelOpen(true);
  }, []);

  // Tell PdfViewer to re-measure after a collapse/expand finishes (PdfViewer
  // listens to window.resize). The delay > the CSS transition duration.
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
    return () => clearTimeout(id);
  }, [panelOpen]);

  return (
    <>
      {/* Collapse handle — always visible at the panel's left edge */}
      <button
        type='button'
        onClick={togglePanel}
        aria-label={panelOpen ? t('panelCollapse') : t('panelExpand')}
        title={panelOpen ? t('panelCollapse') : t('panelExpand')}
        className='group relative flex w-6 shrink-0 items-center justify-center border-l bg-muted/40 transition-colors hover:bg-muted'
      >
        <span className='flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:border-primary group-hover:text-primary'>
          <IconChevronRight
            className={cn('size-3.5 transition-transform duration-300', !panelOpen && 'rotate-180')}
          />
        </span>
      </button>

      {/* Panel column */}
      <aside
        className={cn(
          'shrink-0 overflow-hidden border-l bg-background transition-[width] duration-300 ease-out',
          panelOpen ? 'w-[24rem]' : 'w-0 border-l-0'
        )}
      >
        <div
          className={cn(
            'flex h-full w-[24rem] flex-col transition-opacity duration-200',
            panelOpen ? 'opacity-100 delay-100' : 'opacity-0'
          )}
        >
          {/* Tab strip */}
          <div className='flex shrink-0 items-center gap-1 border-b px-2'>
            <PanelTabButton
              active={panelTab === 'info'}
              onClick={() => switchPanelTab('info')}
              icon={<IconInfoCircle className='size-3.5' />}
              label={t('tabInfo')}
            />
            <PanelTabButton
              active={panelTab === 'citations'}
              onClick={() => switchPanelTab('citations')}
              icon={<IconQuote className='size-3.5' />}
              label={t('citations')}
            />
            <PanelTabButton
              active={panelTab === 'highlights'}
              onClick={() => switchPanelTab('highlights')}
              icon={<IconHighlight className='size-3.5' />}
              label={t('highlight')}
            />
            <PanelTabButton
              active={panelTab === 'ai'}
              onClick={() => switchPanelTab('ai')}
              icon={<IconSparkles className='size-3.5' />}
              label='Ask AI'
            />
          </div>

          {/* Body. Ask AI keys on paperId so it remounts with the right thread
           *  when the user switches papers — but the container around it (this
           *  aside) doesn't, so visually the panel stays open. */}
          {panelTab === 'ai' ? (
            paper ? (
              <AskAiTab key={paperId} paperId={paperId} onJumpToPage={onJumpToPage} />
            ) : (
              <div className='p-4 text-sm text-muted-foreground'>{t('loading')}</div>
            )
          ) : panelTab === 'highlights' ? (
            <HighlightsTab paperId={paperId} onJumpToPage={onJumpToPage} />
          ) : (
            <div className='min-h-0 flex-1 overflow-y-auto p-4'>
              {loading ? (
                <p className='text-sm text-muted-foreground'>{t('loading')}</p>
              ) : !paper ? (
                <p className='text-sm text-muted-foreground'>{t('paperNotFound')}</p>
              ) : panelTab === 'citations' ? (
                <CitationsSection paperId={paperId} />
              ) : (
                <InfoTab paper={paper} />
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function PanelTabButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors',
        active
          ? 'border-primary font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function InfoTab({ paper }: { paper: Paper }) {
  const t = useTranslations('papers');
  const authorLine = formatAuthors(paper.authors);
  const journal = paper.journalShort || paper.journal || null;
  const metaParts: string[] = [];
  if (authorLine) metaParts.push(authorLine);
  if (paper.year) metaParts.push(String(paper.year));
  if (journal) metaParts.push(journal);

  const slugs: string[] = [];
  if (paper.domain && paper.domain !== 'unknown') slugs.push(paper.domain);
  if (paper.subtopics) for (const s of paper.subtopics) if (!slugs.includes(s)) slugs.push(s);
  const byAxis = new Map<string, string[]>();
  for (const slug of slugs) {
    const axis = getAxis(slug);
    if (!axis) continue;
    const arr = byAxis.get(axis) ?? [];
    arr.push(slug);
    byAxis.set(axis, arr);
  }

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='break-words text-base font-semibold leading-snug'>
          {paper.title || t('untitled')}
        </h1>
        {metaParts.length > 0 && (
          <p className='mt-1 text-xs text-muted-foreground'>
            {metaParts.join(' · ')}
            {paper.doi && (
              <>
                {' · '}
                <a
                  href={`https://doi.org/${paper.doi}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline'
                >
                  DOI
                  <IconExternalLink className='size-3' aria-hidden />
                </a>
              </>
            )}
          </p>
        )}
      </div>

      {slugs.length > 0 && (
        <div className='flex flex-col gap-2'>
          {AXIS_ORDER.map(({ axis, labelKey }) => {
            const items = axis ? byAxis.get(axis) : undefined;
            if (!items || items.length === 0) return null;
            return (
              <div key={labelKey} className='space-y-1'>
                <span className='text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
                  {t(labelKey)}
                </span>
                <div className='flex flex-wrap gap-1.5'>
                  {items.map((slug) => {
                    const ax = getAxis(slug);
                    return (
                      <span
                        key={slug}
                        className={cn(
                          'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium',
                          ax ? AXIS_COLOR[ax] : ''
                        )}
                      >
                        {t(`domain.${slug}`)}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {paper.domainConfidence && (
            <p className='text-[11px] text-muted-foreground'>
              {t('domainConfidenceLabel')}: {t(`domainConfidence.${paper.domainConfidence}`)}
            </p>
          )}
        </div>
      )}

      {paper.abstract && (
        <div className='space-y-1'>
          <h2 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            {t('abstract')}
          </h2>
          <p className='text-sm leading-relaxed text-foreground/90'>{paper.abstract}</p>
        </div>
      )}
    </div>
  );
}

/**
 * HighlightsTab — lists this user's saved highlights for the paper, newest
 * first, grouped visually by colour swatch. Click a row to jump to its page;
 * hover to reveal a delete button. Subscribes to Firestore directly (like the
 * Ask AI thread) so it stays live as the user highlights while reading.
 *
 * @phase R237ar
 */
function HighlightsTab({
  paperId,
  onJumpToPage
}: {
  paperId: string;
  onJumpToPage: (page: number) => void;
}) {
  const t = useTranslations('papers');
  const tenantId = useTenantId();
  const [items, setItems] = useState<HighlightAnnotation[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const unsub = subscribeAnnotations(tenantId, paperId, (anns) => {
      setItems(
        anns
          .filter((a): a is HighlightAnnotation => a.kind === 'highlight')
          .toSorted((a, b) => b.createdAt - a.createdAt)
      );
      setLoaded(true);
    });
    return unsub;
  }, [tenantId, paperId]);

  const remove = useCallback(
    (id: string) => {
      if (!tenantId) return;
      void deleteAnnotation(tenantId, paperId, id);
    },
    [tenantId, paperId]
  );

  if (!loaded) {
    return (
      <div className='min-h-0 flex-1 overflow-y-auto p-4 text-sm text-muted-foreground'>
        {t('loading')}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center'>
        <IconHighlight className='size-8 text-muted-foreground/40' />
        <p className='text-sm font-medium'>{t('highlightsEmptyTitle')}</p>
        <p className='text-xs text-muted-foreground'>{t('highlightsEmptyHint')}</p>
      </div>
    );
  }

  return (
    <div className='min-h-0 flex-1 overflow-y-auto p-3'>
      <div className='space-y-1.5'>
        {items.map((hl) => {
          const page = hl.rects[0]?.page ?? 1;
          return (
            <div
              key={hl.id}
              className='group flex items-start gap-2 rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted/50'
            >
              <button
                type='button'
                onClick={() => onJumpToPage(page)}
                className='flex min-w-0 flex-1 items-start gap-2 text-left'
                aria-label={`${t('page')} ${page}: ${hl.text}`}
                title={`${t('page')} ${page}`}
              >
                <span
                  className='mt-0.5 h-4 w-1 shrink-0 rounded-full'
                  style={{ backgroundColor: HIGHLIGHT_FILL[hl.color] }}
                  aria-hidden
                />
                <span className='min-w-0 flex-1'>
                  <span className='line-clamp-3 text-xs leading-relaxed text-foreground'>
                    {hl.text}
                  </span>
                  <span className='mt-0.5 block text-[10.5px] text-muted-foreground'>
                    {t('page')} {page}
                  </span>
                </span>
              </button>
              <button
                type='button'
                onClick={() => remove(hl.id)}
                className='shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100'
                aria-label={t('highlightDelete')}
                title={t('highlightDelete')}
              >
                <IconTrash className='size-3.5' />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
