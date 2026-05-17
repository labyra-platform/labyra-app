'use client';

// R165-phase-1-oxlint: oxlint cleanup

import {
  IconArrowLeft,
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
 * Paper detail page — metadata + processing timeline + actions.
 * @phase R160-ai-5b-2
 */
import { useState } from 'react';
import { toast } from 'sonner';
// R164-phase-8-9b: version history
import { VersionHistoryViewer } from '@/components/versioning/version-history-viewer';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { usePaper } from '@/lib/firestore/queries/papers';
import { CANCELLABLE_STATUSES, TERMINAL_STATUSES } from '@/types/papers';
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

export function PaperDetail({ paperId }: { paperId: string }) {
  const t = useTranslations('papers');
  const _router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const { paper, loading } = usePaper(paperId);
  const [cancelling, setCancelling] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  if (loading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <IconLoader2 className='size-6 animate-spin text-muted-foreground' />
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
      toast.error(t('cancelFailed'), {
        description: e instanceof Error ? e.message : 'unknown'
      });
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

  const canCancel = CANCELLABLE_STATUSES.has(paper.status);
  const canReprocess = TERMINAL_STATUSES.has(paper.status);

  return (
    <div className='max-w-3xl mx-auto space-y-6'>
      <Link
        href={`/${locale}/dashboard/papers`}
        className='inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground'
      >
        <IconArrowLeft className='size-3.5' />
        {t('backToList')}
      </Link>

      <header className='space-y-2'>
        <div className='flex items-start gap-3'>
          <IconFileText className='size-6 mt-1 text-muted-foreground shrink-0' />
          <div className='flex-1 min-w-0'>
            <h1 className='text-xl font-semibold tracking-tight break-words'>
              {paper.title || t('untitled')}
            </h1>
            <p className='text-muted-foreground text-sm mt-1'>
              {paper.pageCount > 0 && <>{t('nPages', { count: paper.pageCount })} · </>}
              {(paper.fileSize / 1024 / 1024).toFixed(2)} MB · v{paper.version}
            </p>
          </div>
        </div>
      </header>

      <section className='space-y-3'>
        <h2 className='text-sm font-medium text-muted-foreground uppercase tracking-wide'>
          {t('processingStatus')}
        </h2>
        <div className='border rounded-lg p-4'>
          <ProcessingTimeline paper={paper} />
        </div>
      </section>

      {paper.costUsd.total > 0 && (
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
        {/* R178-1b: View PDF — always available regardless of status */}
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
      </section>

      {/* R166-6b-1: citations */}
      <CitationsSection paperId={paperId} />

      {/* R164-phase-8-9b: version history */}
      <section className='space-y-2'>
        <VersionHistoryViewer entity='papers' id={paperId} />
      </section>
    </div>
  );
}
