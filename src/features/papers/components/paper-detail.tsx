'use client';

// R165-phase-1-oxlint: oxlint cleanup
// R223: info-priority redesign — research content (abstract + citations) first,
//   processing/cost demoted; richer header (authors·year·journal·DOI); grouped
//   domain chips; cost gated to superadmin.

import {
  IconArchive,
  IconArrowLeft,
  IconChevronDown,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconLoader2,
  IconRefresh,
  IconX
} from '@tabler/icons-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
/**
 * Paper detail page — research metadata + abstract + citations, then processing.
 * @phase R160-ai-5b-2 / R223 redesign
 */
import { useState } from 'react';
import { toast } from 'sonner';
// R164-phase-8-9b: version history
import { VersionHistoryViewer } from '@/components/versioning/version-history-viewer';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsSuperAdmin } from '@/lib/auth/use-claims';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { PaperOpenAlexBadge } from '@/features/papers/components/paper-openalex-badge';
import { usePaper } from '@/lib/firestore/queries/papers';
import { AXIS_COLOR, getAxis } from '@/features/papers/lib/taxonomy';
import { cn } from '@/lib/utils';
import { CANCELLABLE_STATUSES, TERMINAL_STATUSES } from '@/types/papers';
import type { Paper } from '@/types/papers';
import { CitationsSection } from './citations-section'; // R166-6b-1
import { ProcessingTimeline } from './processing-timeline';

async function callApi(path: string, method: 'POST' = 'POST') {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'request_failed' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/** R223 #4: author line — "Zhang et al." for many, full name for one. */
function formatAuthors(authors: string[] | undefined): string | null {
  if (!authors || authors.length === 0) return null;
  const first = authors[0]?.trim();
  if (!first) return null;
  return authors.length > 3 ? `${first} et al.` : authors.join(', ');
}

export function PaperDetail({ paperId }: { paperId: string }) {
  const t = useTranslations('papers');
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const isSuperAdmin = useIsSuperAdmin(); // R223 #3: cost is internal/ops-only
  const { paper, loading } = usePaper(paperId);
  const [cancelling, setCancelling] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  if (loading) {
    return (
      <div className='max-w-3xl mx-auto space-y-6'>
        <div className='space-y-3'>
          <Skeleton className='h-7 w-3/4' />
          <Skeleton className='h-4 w-1/2' />
          <div className='flex flex-wrap gap-2'>
            <Skeleton className='h-5 w-24' />
            <Skeleton className='h-5 w-20' />
          </div>
        </div>
        <Skeleton className='h-20 w-full rounded-lg' />
        <Skeleton className='h-32 w-full rounded-lg' />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className='text-center py-12'>
        <p className='text-muted-foreground'>{t('paperNotFound')}</p>
        <Link
          href={`/${locale}/dashboard/papers`}
          className='inline-flex items-center gap-2 mt-4 text-sm underline'
        >
          <IconArrowLeft className='size-3.5' />
          {t('backToList')}
        </Link>
      </div>
    );
  }

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await callApi(`/api/papers/${paperId}/cancel`);
      toast.success(t('cancelRequested'));
    } catch (e) {
      toast.error(t('cancelFailed'), { description: e instanceof Error ? e.message : 'unknown' });
    } finally {
      setCancelling(false);
    }
  };

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      await callApi(`/api/papers/${paperId}/reprocess`);
      toast.success(t('reprocessStarted'));
    } catch (e) {
      toast.error(t('reprocessFailed'), {
        description: e instanceof Error ? e.message : 'unknown'
      });
    } finally {
      setReprocessing(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm(t('archiveConfirm'))) return;
    setArchiving(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/papers/${paperId}?reason=manual_archive`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }
      toast.success(t('archiveSuccess'));
      router.push(`/${locale}/dashboard/papers`);
    } catch (e) {
      toast.error(t('archiveFailed'), {
        description: e instanceof Error ? e.message : 'unknown'
      });
    } finally {
      setArchiving(false);
    }
  };

  const canCancel = CANCELLABLE_STATUSES.has(paper.status);
  const canReprocess = TERMINAL_STATUSES.has(paper.status);

  // R223 #4: research metadata line — authors · year · journal.
  const authorLine = formatAuthors(paper.authors);
  const journal = paper.journalShort || paper.journal || null;
  const metaParts: string[] = [];
  if (authorLine) metaParts.push(authorLine);
  if (paper.year) metaParts.push(String(paper.year));
  if (journal) metaParts.push(journal);

  return (
    <div className='max-w-3xl mx-auto space-y-6'>
      {/* R237c: "Back to papers" link removed — the tab strip's "Papers"
          anchor handles list navigation, freeing the reader's vertical space. */}

      {/* R223 #4: header now leads with the paper's own identity — authors, year,
          journal, DOI — not file stats (those move to Processing, demoted). */}
      <header className='space-y-2'>
        <div className='flex items-start gap-3'>
          <IconFileText className='size-6 mt-1 text-muted-foreground shrink-0' />
          <div className='flex-1 min-w-0'>
            <h1 className='text-xl font-semibold tracking-tight break-words'>
              {paper.doi ? (
                <a
                  href={`https://doi.org/${paper.doi}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='group inline decoration-muted-foreground/40 underline-offset-4 hover:underline'
                  title={t('openSource')}
                >
                  {paper.title || t('untitled')}
                  <IconExternalLink
                    className='ml-1 inline size-4 align-baseline text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100'
                    aria-hidden
                  />
                </a>
              ) : (
                paper.title || t('untitled')
              )}
            </h1>
            {metaParts.length > 0 && (
              <p className='text-sm text-muted-foreground mt-1'>
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
        </div>
      </header>

      {/* R237ca: OpenAlex authoritative classification (primary), above the
          Gemini taxonomy which provides materials-specific subtopics. */}
      <PaperOpenAlexBadge
        field={paper.openalexField}
        subfield={paper.openalexSubfield}
        topic={paper.openalexTopic}
        score={paper.openalexTopicScore}
        variant='full'
      />

      {/* R223 #5: domain classification — grouped by axis with labels so the four
          conceptually-different chip types (application / materials / synthesis /
          characterization) are visually separated, with confidence shown apart. */}
      <DomainSection paper={paper} />

      {/* R223 #1: abstract — the actual research content, surfaced high. */}
      {paper.abstract && (
        <section className='space-y-2'>
          <h2 className='text-sm font-medium text-muted-foreground uppercase tracking-wide'>
            {t('abstract')}
          </h2>
          <p className='text-sm leading-relaxed text-foreground/90'>{paper.abstract}</p>
        </section>
      )}

      {/* R223 #1: citations promoted above processing/cost — this is the
          research value of the knowledge base, not operational detail. */}
      <CitationsSection paperId={paperId} paper={paper} />

      {/* R223 #2: processing status demoted + collapsed into a single summary
          line. The 8 green checks no longer occupy a full screen of zero-signal
          space; expand on demand. Failed/in-progress states stay visible via the
          summary label color. */}
      <ProcessingSummary paper={paper} />

      {/* R223 #3: cost is internal ops/economics telemetry — gated to superadmin
          (founder) only. SECURITY NOTE (debt B): this is a UI gate only;
          paper.costUsd still arrives in the client Firestore snapshot, so it is
          inspectable via DevTools. If Labyra opens to untrusted multi-tenant
          users, move cost to a papers/{id}/private/cost subcollection with
          admin-only Firestore rules BEFORE launch. */}
      {isSuperAdmin && paper.costUsd.total > 0 && (
        <section className='space-y-3'>
          <h2 className='text-sm font-medium text-muted-foreground uppercase tracking-wide'>
            {t('cost')}
          </h2>
          <div className='border rounded-lg p-4 text-sm space-y-1'>
            {paper.costUsd.ocr > 0 && (
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>OCR</span>
                <span>${paper.costUsd.ocr.toFixed(4)}</span>
              </div>
            )}
            {paper.costUsd.enrichment > 0 && (
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>{t('enrichment')}</span>
                <span>${paper.costUsd.enrichment.toFixed(4)}</span>
              </div>
            )}
            {paper.costUsd.embedding > 0 && (
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>{t('embedding')}</span>
                <span>${paper.costUsd.embedding.toFixed(4)}</span>
              </div>
            )}
            <div className='flex justify-between pt-1 border-t font-medium'>
              <span>{t('total')}</span>
              <span>${paper.costUsd.total.toFixed(4)}</span>
            </div>
          </div>
        </section>
      )}

      <section className='flex flex-wrap gap-2'>
        <Link
          href={`/${locale}/dashboard/papers/${paperId}/view`}
          className='inline-flex items-center gap-2 rounded-md border bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          aria-label={t('viewPdf')}
        >
          <IconEye className='size-3.5' />
          {t('viewPdf')}
        </Link>
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className='inline-flex items-center gap-2 text-sm border rounded-md px-3 py-1.5 hover:bg-muted disabled:opacity-50'
          >
            {cancelling ? (
              <IconLoader2 className='size-3.5 animate-spin' />
            ) : (
              <IconX className='size-3.5' />
            )}
            {t('cancel')}
          </button>
        )}
        {canReprocess && (
          <button
            onClick={handleReprocess}
            disabled={reprocessing}
            className='inline-flex items-center gap-2 text-sm border rounded-md px-3 py-1.5 hover:bg-muted disabled:opacity-50'
          >
            {reprocessing ? (
              <IconLoader2 className='size-3.5 animate-spin' />
            ) : (
              <IconRefresh className='size-3.5' />
            )}
            {t('reprocess')}
          </button>
        )}
        <button
          onClick={handleArchive}
          disabled={archiving}
          className='inline-flex items-center gap-2 text-sm border rounded-md px-3 py-1.5 hover:bg-muted disabled:opacity-50 text-muted-foreground'
        >
          {archiving ? (
            <IconLoader2 className='size-3.5 animate-spin' />
          ) : (
            <IconArchive className='size-3.5' />
          )}
          {t('archive')}
        </button>
      </section>

      <section className='space-y-2'>
        <VersionHistoryViewer entity='papers' id={paperId} />
      </section>
    </div>
  );
}

// R223 #5: render domain chips grouped by axis (application / materials_class /
// synthesis / characterization), each group with a small label, and confidence
// shown separately — instead of one undifferentiated row mixing all four types.
const AXIS_ORDER: { axis: ReturnType<typeof getAxis>; labelKey: string }[] = [
  { axis: 'application', labelKey: 'axisApplication' },
  { axis: 'materials_class', labelKey: 'axisMaterials' },
  { axis: 'synthesis', labelKey: 'axisSynthesis' },
  { axis: 'characterization', labelKey: 'axisCharacterization' },
  { axis: 'meta', labelKey: 'axisMeta' }
];

function DomainSection({ paper }: { paper: Paper }) {
  const t = useTranslations('papers');
  const slugs: string[] = [];
  if (paper.domain && paper.domain !== 'unknown') slugs.push(paper.domain);
  if (paper.subtopics) {
    for (const s of paper.subtopics) if (!slugs.includes(s)) slugs.push(s);
  }
  if (slugs.length === 0) return null;

  // Bucket slugs by axis.
  const byAxis = new Map<string, string[]>();
  for (const slug of slugs) {
    const axis = getAxis(slug);
    if (!axis) continue;
    const arr = byAxis.get(axis) ?? [];
    arr.push(slug);
    byAxis.set(axis, arr);
  }
  const confidence = paper.domainConfidence;

  return (
    <section className='space-y-2'>
      <div className='flex flex-wrap gap-x-6 gap-y-2'>
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
      </div>
      {confidence && (
        <p className='text-[11px] text-muted-foreground'>
          {t('domainConfidenceLabel')}: {t(`domainConfidence.${confidence}`)}
        </p>
      )}
    </section>
  );
}

// R223 #2: collapsed processing summary. Shows "Indexed · N steps" (or the
// current/failed status) as one line; expands to the full timeline + file stats.
function ProcessingSummary({ paper }: { paper: Paper }) {
  const t = useTranslations('papers');
  const [open, setOpen] = useState(false);
  const isIndexed = paper.status === 'indexed';
  const isFailed = paper.status === 'failed';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className='flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-sm hover:bg-muted/50'>
        <span className='flex items-center gap-2'>
          <span
            className={cn(
              'inline-flex size-2 rounded-full',
              isIndexed
                ? 'bg-emerald-500'
                : isFailed
                  ? 'bg-destructive'
                  : 'bg-sky-500 animate-pulse'
            )}
            aria-hidden
          />
          <span className='font-medium'>{t(`status.${paper.status}`)}</span>
          <span className='text-muted-foreground'>
            · {paper.pageCount > 0 && <>{t('nPages', { count: paper.pageCount })} · </>}
            {(paper.fileSize / 1024 / 1024).toFixed(1)} MB · v{paper.version}
          </span>
        </span>
        <IconChevronDown
          className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='border border-t-0 rounded-b-lg p-4'>
          <ProcessingTimeline paper={paper} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
