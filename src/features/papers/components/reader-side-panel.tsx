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
  IconPhoto,
  IconInfoCircle,
  IconLanguage,
  IconQuote,
  IconSparkles
} from '@tabler/icons-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AXIS_COLOR, getAxis } from '@/features/papers/lib/taxonomy';
import { useTenantId } from '@/lib/auth/use-claims';
import { deleteAnnotation, subscribeAnnotations } from '@/lib/firestore/queries/annotations';
import { usePaper, usePretranslation, type Pretranslation } from '@/lib/firestore/queries/papers';
import { sanitizeFormatting } from '@/features/papers/lib/sanitize-formatting';
import {
  type TranslationRecord,
  usePaperTranslationsStore
} from '@/features/papers/stores/paper-translations-store';
import { formatSciNode, formatSciText } from '@/features/spectra/utils/format-units';
import { cn } from '@/lib/utils';
import { PanelSplitter } from '@/features/papers/components/panel-splitter';
import {
  clampPanel,
  PANEL_DEFAULT,
  PANEL_MIN,
  panelMax,
  useReaderPanelStore
} from '@/features/papers/stores/reader-panel-store';
import type { AnnotationColor, HighlightAnnotation } from '@/types/annotations';
import type { Paper } from '@/types/papers';
import { AskAiTab } from './ask-ai-tab';
import { CitationsSection } from './citations-section';
import { FiguresTab } from './figures-tab';

/** Solid (opaque) swatch per highlight color — used for the list's left bar so
 *  it reads clearly, unlike the translucent on-page HIGHLIGHT_FILL. */
const HIGHLIGHT_SWATCH: Record<AnnotationColor, string> = {
  yellow: '#FFC400',
  green: '#00C853',
  blue: '#2979FF',
  pink: '#F50057',
  orange: '#FF6D00'
};

/** Tidy text captured from the PDF text layer for display.
 *  PDF text layers introduce artifacts: words split across line breaks, soft
 *  hyphens, doubled spaces, and — most visibly — stray spaces around chemical
 *  subscripts ("TiO 2", "WS 2"). This cleans them for the list. (Cosmetic only;
 *  stored text is untouched.)
 *
 *  Subscript joining is deliberately conservative to avoid corrupting ordinary
 *  text. We only fuse "<token> <1-2 digits>" when the token looks like a
 *  formula — i.e. it contains ≥2 uppercase letters (TiO, WO, WS, MoS, SiO,
 *  WSe, H2O…). That keeps "Fig 2", "Table 3", "The 2 systems", and "652 nm"
 *  intact (none have two capitals in the token before the number), while
 *  fixing the formulas a materials reader actually hits. Counting words like
 *  "Fig"/"Table" are protected first as a belt-and-braces guard. */
function normalizeHighlightText(raw: string): string {
  let s = raw
    .replace(/\u00AD/g, '') // soft hyphen
    .replace(/-\s*\n\s*/g, '') // hyphenated line break → join word
    .replace(/\s*\n\s*/g, ' '); // remaining line breaks → space

  // Protect "Fig 2", "Table 3", "Section 4", etc. (number is a reference, not a
  // subscript) by hiding the space behind a sentinel before the join step.
  s = s.replace(
    /\b(Fig|Figure|Table|Tab|Scheme|Section|Sec|Eq|Equation|Ref|Step|Part|Chapter|Ch|No|Note|Sample|Entry|Day|Page|Vol|Movie|Video)\b\.?\s+(\d)/gi,
    '$1\u0000$2'
  );

  // Join chemical subscripts: a token containing ≥2 uppercase letters directly
  // followed by a 1–2 digit number → fuse (TiO 2 → TiO2, WS 2 → WS2).
  s = s.replace(/\b([A-Za-z]*[A-Z][A-Za-z]*[A-Z][A-Za-z]*)\s+(\d{1,2})\b/g, '$1$2');

  return (
    s
      // oxlint-disable-next-line no-control-regex
      .replace(/\u0000/g, ' ') // restore protected counting-word spaces
      .replace(/\s+([,.;:!?])/g, '$1') // drop space before punctuation ("TiO2 ," → "TiO2,")
      .replace(/\s{2,}/g, ' ') // collapse runs of spaces
      .trim()
  );
}

/** Stable empty array so the translations selector doesn't churn renders. */
const EMPTY_TRANSLATIONS: TranslationRecord[] = [];

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
  onJumpToPage: (page: number, y?: number, highlight?: string) => void;
}

export function ReaderSidePanel({ paperId, onJumpToPage }: ReaderSidePanelProps) {
  const t = useTranslations('papers');
  const locale = useLocale();
  const { paper, loading } = usePaper(paperId);
  const pretranslation = usePretranslation(paperId, locale);

  // R237ao: the active tab is workspace-level, not per-paper. The user expects
  // "I was on Ask AI, I switch papers, I'm still on Ask AI". Since this panel
  // doesn't remount on paper switch (it lives above PaperReadView and isn't
  // keyed), a local state survives the switch — exactly the desired behaviour.
  const [panelTab, setPanelTab] = useState<
    'info' | 'citations' | 'highlights' | 'translations' | 'figures' | 'ai'
  >('info');

  // R530: width and collapse move to a persisted store. panelOpen used to be
  // local useState(false), so the panel shut itself every time you navigated —
  // the same class of fault as R529's tabs, one layer up.
  const collapsed = useReaderPanelStore((s) => s.collapsed);
  const width = useReaderPanelStore((s) => s.width);
  const setCollapsed = useReaderPanelStore((s) => s.setCollapsed);
  const setWidth = useReaderPanelStore((s) => s.setWidth);
  const resetWidth = useReaderPanelStore((s) => s.reset);
  const panelOpen = !collapsed;
  const togglePanel = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  // The splitter's bounds depend on how much room the split has, so the shell
  // is measured rather than assumed. Re-measured on window resize because a
  // laptop that gets plugged into a monitor changes the answer.
  const shellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [shellWidth, setShellWidth] = useState(0);
  useEffect(() => {
    const measure = () => setShellWidth(shellRef.current?.parentElement?.clientWidth ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const max = shellWidth > 0 ? panelMax(shellWidth) : PANEL_DEFAULT;

  // A width that was fine on a monitor can exceed the max on a laptop. Clamp on
  // arrival rather than trusting what localStorage remembered.
  const shown = shellWidth > 0 ? clampPanel(width, shellWidth) : width;

  const commitWidth = useCallback(
    (next: number) => {
      setWidth(next);
      if (panelRef.current) panelRef.current.style.width = '';
    },
    [setWidth]
  );
  /**
   * R531: pressing the tab you are already on collapses the panel.
   *
   * paper-ai-panel.md §4 asks whether the Ask AI control is a toggle or dead
   * weight while the AI panel is open. It was dead weight — and so were the
   * other five, because they are the same button. A control that looks pressable
   * and does nothing gets pressed twice, and then the app is "frozen".
   *
   * Making the pressed tab un-press is what `aria-pressed` already promises,
   * and it gives the panel a second way out — until now there was exactly one.
   */
  const switchPanelTab = useCallback(
    (next: 'info' | 'citations' | 'highlights' | 'translations' | 'figures' | 'ai') => {
      if (next === panelTab && !collapsed) {
        setCollapsed(true);
        return;
      }
      setPanelTab(next);
      setCollapsed(false);
    },
    [panelTab, collapsed, setCollapsed]
  );

  // Tell PdfViewer to re-measure after a collapse/expand finishes (PdfViewer
  // listens to window.resize). The delay > the CSS transition duration.
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
    return () => clearTimeout(id);
  }, [panelOpen]);

  // Committed width changes need the same re-measure, but without the wait —
  // the drag is already over and the width is already applied.
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [width]);

  return (
    <>
      {/* R530: the splitter replaces the collapse handle when the panel is
          open. A 24px button that only toggles was answering the wrong
          question — people did not want the panel *on*, they wanted it a
          particular width, and the only widths on offer were 384px and zero.
          That is also where the rendering fault came from: the shell animated
          to w-0 while the content inside it stayed pinned at w-[24rem], so the
          panel did not shrink, it got cropped. One width, one place, no crop. */}
      {panelOpen ? (
        <PanelSplitter
          width={shown}
          min={PANEL_MIN}
          max={max}
          onCommit={commitWidth}
          onReset={resetWidth}
          panelRef={panelRef}
        />
      ) : (
        <button
          type='button'
          onClick={togglePanel}
          aria-label={t('panelExpand')}
          title={t('panelExpand')}
          className='group relative flex w-6 shrink-0 items-center justify-center bg-transparent transition-colors'
        >
          <span className='bg-background text-muted-foreground group-hover:border-primary group-hover:text-primary flex size-6 items-center justify-center rounded-full border opacity-0 shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:opacity-100'>
            <IconChevronRight className='size-4 rotate-180' />
          </span>
        </button>
      )}

      {/* Panel column */}
      <aside
        ref={panelRef}
        style={panelOpen ? { width: shown } : undefined}
        className={cn(
          'bg-background shrink-0 overflow-hidden border-l',
          panelOpen ? 'flex flex-col' : 'w-0 border-l-0'
        )}
      >
        <div className={cn('flex h-full min-w-0 flex-1 flex-col', !panelOpen && 'hidden')}>
          {/* Tab strip — scrolls horizontally if the labels don't all fit.
              R530: collapse lives here now. The splitter took the panel edge,
              and a separator that also closed things would be two controls
              wearing one hit area — drag it slightly and you would lose the
              panel instead of resizing it. */}
          <div className='flex shrink-0 items-center gap-1 px-2 pt-2 pb-1'>
            <button
              type='button'
              onClick={togglePanel}
              aria-label={t('panelCollapse')}
              title={t('panelCollapse')}
              className='text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md transition-colors'
            >
              <IconChevronRight className='size-4' />
            </button>
            <div className='bg-muted/60 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-lg p-1'>
              <PanelTabButton
                active={panelTab === 'info'}
                onClick={() => switchPanelTab('info')}
                icon={<IconInfoCircle className='size-4' />}
                label={t('tabInfo')}
              />
              <PanelTabButton
                active={panelTab === 'citations'}
                onClick={() => switchPanelTab('citations')}
                icon={<IconQuote className='size-4' />}
                label={t('citations')}
              />
              <PanelTabButton
                active={panelTab === 'highlights'}
                onClick={() => switchPanelTab('highlights')}
                icon={<IconHighlight className='size-4' />}
                label={t('highlight')}
              />
              <PanelTabButton
                active={panelTab === 'translations'}
                onClick={() => switchPanelTab('translations')}
                icon={<IconLanguage className='size-4' />}
                label={t('translations')}
              />
              <PanelTabButton
                active={panelTab === 'figures'}
                onClick={() => switchPanelTab('figures')}
                icon={<IconPhoto className='size-4' />}
                label={t('figures')}
              />
              <PanelTabButton
                active={panelTab === 'ai'}
                onClick={() => switchPanelTab('ai')}
                icon={<IconSparkles className='size-4' />}
                label='Ask AI'
              />
            </div>
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
          ) : panelTab === 'translations' ? (
            <TranslationsTab paperId={paperId} onJumpToPage={onJumpToPage} />
          ) : panelTab === 'figures' ? (
            <FiguresTab paperId={paperId} onJumpToPage={onJumpToPage} />
          ) : (
            <div className='min-h-0 flex-1 overflow-y-auto p-4'>
              {loading ? (
                <p className='text-sm text-muted-foreground'>{t('loading')}</p>
              ) : !paper ? (
                <p className='text-sm text-muted-foreground'>{t('paperNotFound')}</p>
              ) : panelTab === 'citations' ? (
                <CitationsSection paperId={paperId} paper={paper} />
              ) : (
                <InfoTab paper={paper} pretranslation={pretranslation} />
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
  // Segmented control (macOS/Linear style). The active tab is a raised pill
  // (solid background + soft shadow) carrying icon + label, so its name is
  // always legible. Inactive tabs collapse to an icon button that lifts a
  // background on hover — clearly tappable — with the label in a tooltip. This
  // fits all five tabs in the 384px panel with no horizontal scroll.
  const button = (
    <button
      type='button'
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'text-body inline-flex h-8 cursor-pointer items-center justify-center rounded-md transition-all',
        active
          ? 'flex-1 gap-1.5 bg-background px-2.5 font-medium text-foreground shadow-sm ring-1 ring-black/[0.04]'
          : 'w-9 shrink-0 text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm'
      )}
    >
      <span className='shrink-0'>{icon}</span>
      {active && <span className='truncate'>{label}</span>}
    </button>
  );
  if (active) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side='bottom'>{label}</TooltipContent>
    </Tooltip>
  );
}

function InfoTab({
  paper,
  pretranslation
}: {
  paper: Paper;
  pretranslation: Pretranslation | null;
}) {
  const t = useTranslations('papers');
  const [showOriginalAbstract, setShowOriginalAbstract] = useState(false);
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
          {paper.title ? formatSciNode(paper.title) : t('untitled')}
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

      {(paper.abstract || pretranslation?.abstract) && (
        <div className='space-y-1'>
          <div className='flex items-center justify-between gap-2'>
            <h2 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
              {t('abstract')}
            </h2>
            {paper.abstract && pretranslation?.abstract && (
              <button
                type='button'
                onClick={() => setShowOriginalAbstract((v) => !v)}
                className='text-[11px] text-muted-foreground transition-colors hover:text-foreground'
              >
                {showOriginalAbstract ? t('showTranslation') : t('showOriginal')}
              </button>
            )}
          </div>
          <p className='text-sm leading-relaxed text-foreground/90'>
            {showOriginalAbstract || !pretranslation?.abstract
              ? paper.abstract
              : pretranslation.abstract}
          </p>
        </div>
      )}

      {pretranslation?.conclusion && (
        <div className='space-y-1'>
          <h2 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            {t('conclusion')}
          </h2>
          <p className='text-sm leading-relaxed text-foreground/90'>{pretranslation.conclusion}</p>
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
  onJumpToPage: (page: number, y?: number, highlight?: string) => void;
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
          const first = hl.rects[0];
          const page = first?.page ?? 1;
          return (
            <div
              key={hl.id}
              className='group flex items-start gap-2 rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted/50'
            >
              <button
                type='button'
                onClick={() => onJumpToPage(page, first?.y)}
                className='flex min-w-0 flex-1 items-start gap-2 text-left'
                aria-label={`${t('page')} ${page}: ${hl.text}`}
                title={`${t('page')} ${page}`}
              >
                <span
                  className='mt-0.5 h-4 w-1 shrink-0 rounded-full'
                  style={{ backgroundColor: HIGHLIGHT_SWATCH[hl.color] }}
                  aria-hidden
                />
                <span className='min-w-0 flex-1'>
                  <span className='line-clamp-3 text-xs leading-relaxed text-foreground'>
                    {formatSciText(normalizeHighlightText(hl.text))}
                  </span>
                  <span className='mt-0.5 block text-[10.5px] text-muted-foreground'>
                    {t('page')} {page}
                  </span>
                </span>
              </button>
              <Button
                variant='ghost'
                size='icon'
                onClick={() => remove(hl.id)}
                className='size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100'
                aria-label={t('highlightDelete')}
                title={t('highlightDelete')}
              >
                <Icons.trash className='size-3.5' />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * TranslationsTab (R237av — side-by-side B2) — lists every region the user has
 * translated in this paper, newest first: the source text (left/top) with its
 * translation beneath, source rendered with chemical subscripts. Click a card
 * to jump back to the original region; hover to remove it from the list. Reads
 * the session store the translate layer writes to.
 */
function TranslationsTab({
  paperId,
  onJumpToPage
}: {
  paperId: string;
  onJumpToPage: (page: number, y?: number, highlight?: string) => void;
}) {
  const t = useTranslations('papers');
  const items = usePaperTranslationsStore((s) => s.byPaper[paperId] ?? EMPTY_TRANSLATIONS);
  const remove = usePaperTranslationsStore((s) => s.remove);
  const clear = usePaperTranslationsStore((s) => s.clear);

  if (items.length === 0) {
    return (
      <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center'>
        <IconLanguage className='size-8 text-muted-foreground/40' />
        <p className='text-sm font-medium'>{t('translationsEmptyTitle')}</p>
        <p className='text-xs text-muted-foreground'>{t('translationsEmptyHint')}</p>
      </div>
    );
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='flex shrink-0 items-center justify-between border-b px-3 py-1.5'>
        <span className='text-xs text-muted-foreground'>{items.length}</span>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => clear(paperId)}
          className='h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive'
        >
          <Icons.trash className='size-3.5' />
          {t('translationsClearAll')}
        </Button>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto p-3'>
        <div className='space-y-2'>
          {items.map((rec) => (
            <div
              key={rec.id}
              className='group rounded-md border border-border bg-card transition-colors hover:bg-muted/40'
            >
              <button
                type='button'
                onClick={() => onJumpToPage(rec.page, rec.yRatio)}
                className='block w-full p-2.5 text-left'
                aria-label={`${t('page')} ${rec.page}`}
              >
                <span className='mb-1 block text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground'>
                  {t('page')} {rec.page}
                </span>
                <span
                  className='block text-xs leading-relaxed text-muted-foreground/70 [&_sub]:align-sub [&_sub]:text-[0.65em] [&_sup]:align-super [&_sup]:text-[0.65em]'
                  // Source is plain text from the layer; escape via textContent semantics.
                >
                  {formatSciText(rec.source)}
                </span>
                <span
                  className={cn(
                    'mt-1.5 block border-l-2 border-primary/40 pl-2 text-xs leading-relaxed text-foreground',
                    '[&_sub]:align-sub [&_sub]:text-[0.65em]',
                    '[&_sup]:align-super [&_sup]:text-[0.65em]',
                    '[&_b]:font-semibold [&_i]:italic',
                    '[&_.katex]:text-[1em]'
                  )}
                >
                  {rec.partialStart && (
                    <span className='select-none text-muted-foreground/45' title={t('partialNote')}>
                      …{' '}
                    </span>
                  )}
                  {/* Render the model's <sub>/<sup>/<b>/<i>/<math> markup. */}
                  <span dangerouslySetInnerHTML={{ __html: sanitizeFormatting(rec.translation) }} />
                  {rec.partialEnd && (
                    <span className='select-none text-muted-foreground/45' title={t('partialNote')}>
                      {' '}
                      …
                    </span>
                  )}
                </span>
              </button>
              <div className='flex justify-end px-2 pb-1.5'>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => remove(paperId, rec.id)}
                  className='size-6 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100'
                  aria-label={t('translationDelete')}
                  title={t('translationDelete')}
                >
                  <Icons.trash className='size-3.5' />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
