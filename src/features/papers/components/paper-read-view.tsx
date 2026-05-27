'use client';

/**
 * PaperReadView — split reading layout: PDF (left, fixed) + metadata panel
 * (right, collapsible). Replaces the separate detail + /view pages with one
 * reference-manager-style split (PDF left ~65%, info right ~35%).
 *
 * R224. Designed as a standalone component (takes paperId) so a future tab
 * system can render several of these in tabs.
 *
 * Performance notes:
 *   - PdfViewer is NOT modified for layout — it's embedded as-is (embedded prop
 *     only hides the redundant back button + lets the column own its height).
 *   - The info panel toggles between two discrete states (open/collapsed), NOT a
 *     draggable splitter. So the PDF width changes at most twice, meaning at most
 *     two PDF re-fits — not one per dragged pixel. After toggling we dispatch a
 *     window resize event; PdfViewer already listens for it (R181) and re-measures
 *     its container width, so the page re-fits cleanly with no extra logic and no
 *     ResizeObserver feedback loop.
 */
import {
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconInfoCircle,
  IconQuote
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AXIS_COLOR, getAxis } from '@/features/papers/lib/taxonomy';
import { usePaper } from '@/lib/firestore/queries/papers';
import { cn } from '@/lib/utils';
import type { Paper } from '@/types/papers';
import { CitationsSection } from './citations-section';
import { PdfViewer } from './pdf-viewer';

type PanelTab = 'info' | 'citations';

function formatAuthors(authors: string[] | undefined): string | null {
  if (!authors || authors.length === 0) return null;
  const first = authors[0]?.trim();
  if (!first) return null;
  return authors.length > 3 ? `${first} et al.` : authors.join(', ');
}

export function PaperReadView({ paperId }: { paperId: string }) {
  const t = useTranslations('papers');
  const { paper, loading } = usePaper(paperId);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<PanelTab>('info');

  // R224: after the panel finishes its width transition, tell PdfViewer to
  // re-measure (it listens on window.resize). Delay > CSS transition duration.
  const togglePanel = useCallback(() => {
    setPanelOpen((v) => !v);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
    return () => clearTimeout(id);
  }, [panelOpen]);

  return (
    <div className='flex h-[calc(100vh-4rem)] w-full overflow-hidden'>
      {/* LEFT: PDF — flexes to fill remaining space */}
      <div className='min-w-0 flex-1'>
        <PdfViewer paperId={paperId} embedded />
      </div>

      {/* Collapse handle — always visible at the panel's left edge */}
      <button
        type='button'
        onClick={togglePanel}
        aria-label={panelOpen ? t('panelCollapse') : t('panelExpand')}
        title={panelOpen ? t('panelCollapse') : t('panelExpand')}
        className='group relative flex w-6 shrink-0 items-center justify-center border-l bg-muted/40 transition-colors hover:bg-muted'
      >
        <span className='flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-all group-hover:scale-110 group-hover:border-primary group-hover:text-primary'>
          {panelOpen ? (
            <IconChevronRight className='size-3.5' />
          ) : (
            <IconChevronLeft className='size-3.5' />
          )}
        </span>
      </button>

      {/* RIGHT: metadata panel — collapsible (width transition) */}
      <aside
        className={cn(
          'shrink-0 overflow-hidden border-l bg-background transition-[width] duration-300 ease-out',
          panelOpen ? 'w-[28rem] max-w-[42vw]' : 'w-0 border-l-0'
        )}
      >
        <div className='flex h-full w-[28rem] max-w-[42vw] flex-col'>
          {/* Panel tabs */}
          <div className='flex shrink-0 items-center gap-1 border-b px-2'>
            <PanelTabButton
              active={tab === 'info'}
              onClick={() => setTab('info')}
              icon={<IconInfoCircle className='size-3.5' />}
              label={t('tabInfo')}
            />
            <PanelTabButton
              active={tab === 'citations'}
              onClick={() => setTab('citations')}
              icon={<IconQuote className='size-3.5' />}
              label={t('citations')}
            />
          </div>

          {/* Panel body — scrolls independently of the PDF */}
          <div className='min-h-0 flex-1 overflow-y-auto p-4'>
            {loading ? (
              <p className='text-sm text-muted-foreground'>{t('loading')}</p>
            ) : !paper ? (
              <p className='text-sm text-muted-foreground'>{t('paperNotFound')}</p>
            ) : tab === 'info' ? (
              <InfoTab paper={paper} />
            ) : (
              <CitationsSection paperId={paperId} />
            )}
          </div>
        </div>
      </aside>
    </div>
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

const AXIS_ORDER: { axis: ReturnType<typeof getAxis>; labelKey: string }[] = [
  { axis: 'application', labelKey: 'axisApplication' },
  { axis: 'materials_class', labelKey: 'axisMaterials' },
  { axis: 'synthesis', labelKey: 'axisSynthesis' },
  { axis: 'characterization', labelKey: 'axisCharacterization' },
  { axis: 'meta', labelKey: 'axisMeta' }
];

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
        <h1 className='text-base font-semibold leading-snug break-words'>
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
