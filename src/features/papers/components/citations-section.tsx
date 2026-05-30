'use client';
import {
  IconBookmark,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconExternalLink,
  IconLoader2,
  IconPaperclip,
  IconPencil
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
/**
 * Citations section for paper detail page.
 *
 * Shows:
 *   - Outbound (papers this paper cites) — from citations where sourcePaperId=this
 *   - Inbound (papers that cite this paper) — from citations where targetPaperId=this
 *   - Summary stats from _stats/citations doc
 *   - Filter UI (R166-6b-2): toggle confidence levels + inLibraryOnly
 *
 * R223b: whole section is collapsible (74 citations is long, especially in the
 * narrow right panel of the split reader). Header shows total; expand to reveal
 * filter + cards. Per-list show-more (COLLAPSED_LIMIT) still applies inside.
 *
 * @phase R166-6b-1 base, R166-6b-2 filter, R166-6b-2-hotfix2 hook-order fix
 */
import { useCallback, useMemo, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { Paper } from '@/types/papers';
import {
  useCitationsBySource,
  useCitationsByTargetPaperId,
  usePaperCitationStats
} from '@/lib/firestore/queries/citations';
import { CitationCard } from './citation-card';

const COLLAPSED_LIMIT = 5;

// R181-10 @r181-10-applied: stable sort key for citation confidence
const CONFIDENCE_ORDER: Record<string, number> = {
  'doi-exact': 0,
  manual: 1,
  'title-fuzzy': 2,
  unverified: 3
};
function byConfidence(a: { confidence: string }, b: { confidence: string }): number {
  const av = CONFIDENCE_ORDER[a.confidence] ?? 99;
  const bv = CONFIDENCE_ORDER[b.confidence] ?? 99;
  return av - bv;
}

// Outbound = this paper's reference list. Show in document order (number, set by
// the worker) so it reads like the printed references; fall back to confidence
// for entries without a number. References with no number sort last.
function byNumberThenConfidence(
  a: { number?: number; confidence: string },
  b: { number?: number; confidence: string }
): number {
  const an = a.number ?? Number.POSITIVE_INFINITY;
  const bn = b.number ?? Number.POSITIVE_INFINITY;
  if (an !== bn) return an - bn;
  return byConfidence(a, b);
}

export function CitationsSection({ paperId, paper }: { paperId: string; paper?: Paper | null }) {
  const t = useTranslations('papers');
  const { stats } = usePaperCitationStats(paperId);
  const { citations: outCitations, loading: outLoading } = useCitationsBySource(paperId);
  const { citations: inCitations, loading: inLoading } = useCitationsByTargetPaperId(paperId);

  const [outExpanded, setOutExpanded] = useState(false);
  const [inExpanded, setInExpanded] = useState(false);

  // R237cn #5: drop the paper's OWN doi from its reference list (a paper does not
  // cite itself — that entry is extraction noise). Then sort in document order.
  const selfDoi = (paper?.doi ?? '').trim().toLowerCase();
  const outSorted = useMemo(
    () =>
      outCitations
        .filter((c) => !selfDoi || (c.targetDoi ?? '').trim().toLowerCase() !== selfDoi)
        .slice()
        .sort(byNumberThenConfidence),
    [outCitations, selfDoi]
  );
  const inSorted = useMemo(() => inCitations.slice().sort(byConfidence), [inCitations]);

  // No stats doc + no citations → don't render section at all (paper not yet processed)
  const hasAnyData = stats !== null || outCitations.length > 0 || inCitations.length > 0;
  if (!hasAnyData && !outLoading && !inLoading) {
    return null;
  }

  const outCount = outSorted.length;
  const inCount = inSorted.length;
  const outVisible = outExpanded ? outSorted : outSorted.slice(0, COLLAPSED_LIMIT);
  const inVisible = inExpanded ? inSorted : inSorted.slice(0, COLLAPSED_LIMIT);

  return (
    <div className='space-y-3'>
      {/* This paper's own identity — clearly separated from its references. */}
      {paper && <SelfDoiCard paper={paper} />}
      {paper && <SupplementaryInfo paperId={paperId} paper={paper} />}

      {/* Outbound — this paper's reference list */}
      <div className='space-y-2 rounded-lg border p-4'>
        <div className='flex items-center justify-between gap-2'>
          <h3 className='flex items-center gap-1.5 text-sm font-medium'>
            <IconBookmark className='size-3.5 text-muted-foreground' aria-hidden />
            {t('referencesTitle', { count: outCount })}
          </h3>
          {outSorted.length > COLLAPSED_LIMIT && (
            <button
              type='button'
              onClick={() => setOutExpanded((v) => !v)}
              className='inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
            >
              {outExpanded ? (
                <IconChevronDown className='size-3' aria-hidden />
              ) : (
                <IconChevronRight className='size-3' aria-hidden />
              )}
              {outExpanded ? t('showLess') : t('showAllCitations', { count: outSorted.length })}
            </button>
          )}
        </div>

        {outLoading ? (
          <div className='flex items-center gap-2 text-muted-foreground text-sm py-2'>
            <IconLoader2 className='size-4 animate-spin' />
            {t('loadingCitations')}
          </div>
        ) : outCount === 0 ? (
          <div className='text-muted-foreground text-sm py-2'>{t('citationsOutEmpty')}</div>
        ) : (
          <div className='space-y-1.5'>
            {outVisible.map((c) => (
              <CitationCard key={c.id} citation={c} />
            ))}
          </div>
        )}
      </div>

      {/* Inbound — papers citing this paper */}
      {inCount > 0 && (
        <div className='space-y-2 rounded-lg border p-4'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='text-sm font-medium'>{t('citationsInTitle', { count: inCount })}</h3>
            {inSorted.length > COLLAPSED_LIMIT && (
              <button
                type='button'
                onClick={() => setInExpanded((v) => !v)}
                className='inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
              >
                {inExpanded ? (
                  <IconChevronDown className='size-3' aria-hidden />
                ) : (
                  <IconChevronRight className='size-3' aria-hidden />
                )}
                {inExpanded ? t('showLess') : t('showAllCitations', { count: inSorted.length })}
              </button>
            )}
          </div>

          {inLoading ? (
            <div className='flex items-center gap-2 text-muted-foreground text-sm py-2'>
              <IconLoader2 className='size-4 animate-spin' />
              {t('loadingCitations')}
            </div>
          ) : (
            <div className='space-y-1.5'>
              {inVisible.map((c) => (
                <CitationCard key={c.id} citation={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The paper's OWN DOI — visually distinct (accent card) so it's never mistaken
 *  for one of its references. */
function SelfDoiCard({ paper }: { paper: Paper }) {
  const t = useTranslations('papers');
  const [copied, setCopied] = useState(false);
  const doi = paper.doi?.trim();
  const handleCopy = useCallback(() => {
    if (!doi) return;
    void navigator.clipboard.writeText(doi);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [doi]);

  return (
    <div className='rounded-lg border border-primary/30 bg-primary/5 p-3'>
      <div className='mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-primary'>
        <IconBookmark className='size-3.5' aria-hidden />
        {t('thisPaperDoi')}
      </div>
      {doi ? (
        <div className='flex items-center gap-2'>
          <a
            href={`https://doi.org/${doi}`}
            target='_blank'
            rel='noopener noreferrer'
            className='min-w-0 flex-1 truncate font-mono text-xs text-foreground hover:underline'
          >
            {doi}
          </a>
          <button
            type='button'
            onClick={handleCopy}
            title={t('copy')}
            aria-label={t('copy')}
            className='shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground'
          >
            {copied ? (
              <IconCheck className='size-3.5 text-primary' />
            ) : (
              <IconCopy className='size-3.5' />
            )}
          </button>
          <a
            href={`https://doi.org/${doi}`}
            target='_blank'
            rel='noopener noreferrer'
            title={t('openDoiNewTab')}
            aria-label={t('openDoiNewTab')}
            className='shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground'
          >
            <IconExternalLink className='size-3.5' />
          </a>
        </div>
      ) : (
        <div className='text-xs text-muted-foreground'>{t('noDoiForPaper')}</div>
      )}
    </div>
  );
}

/** Supplementary Information slot. SI files live on the publisher site and are
 *  not reliably in any API, so the link is user-provided (saved to paper.siUrl
 *  via PATCH). May later be auto-filled best-effort from Crossref relation. */
function SupplementaryInfo({ paperId, paper }: { paperId: string; paper: Paper }) {
  const t = useTranslations('papers');
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const stored = savedUrl !== null ? savedUrl : (paper.siUrl ?? '');
  const current = stored.trim();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const save = useCallback(async () => {
    const next = draft.trim();
    setSaving(true);
    setError(false);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('no auth');
      const token = await user.getIdToken();
      const res = await fetch(`/api/papers/${paperId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siUrl: next })
      });
      if (!res.ok) throw new Error('patch_failed');
      setSavedUrl(next);
      setEditing(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, [draft, paperId]);

  const startEdit = useCallback(() => {
    setDraft(current);
    setEditing(true);
  }, [current]);

  return (
    <div className='rounded-lg border p-3'>
      <div className='mb-1.5 flex items-center justify-between'>
        <div className='flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground'>
          <IconPaperclip className='size-3.5' aria-hidden />
          {t('supplementaryInfo')}
        </div>
        {current && !editing && (
          <button
            type='button'
            onClick={startEdit}
            className='inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground'
          >
            <IconPencil className='size-3' aria-hidden />
            {t('edit')}
          </button>
        )}
      </div>

      {current && !editing ? (
        <a
          href={current}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex items-center gap-1.5 break-all text-xs text-primary hover:underline'
        >
          <IconExternalLink className='size-3.5 shrink-0' aria-hidden />
          {t('openSupplementary')}
        </a>
      ) : (
        <div className='space-y-1.5'>
          <input
            type='url'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('supplementaryPlaceholder')}
            aria-label={t('supplementaryInfo')}
            className='w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary'
          />
          <div className='flex items-center gap-2'>
            <button
              type='button'
              disabled={saving}
              onClick={save}
              className='rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60'
            >
              {saving ? t('saving') : t('save')}
            </button>
            {(current || editing) && (
              <button
                type='button'
                onClick={() => {
                  setEditing(false);
                  setDraft(current);
                }}
                className='text-[11px] text-muted-foreground hover:text-foreground'
              >
                {t('cancel')}
              </button>
            )}
            {error && <span className='text-[11px] text-destructive'>{t('saveFailed')}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
