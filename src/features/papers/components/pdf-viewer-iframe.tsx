'use client';

import { IconAlertCircle, IconArrowLeft, IconDownload } from '@tabler/icons-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatSciNode } from '@/features/spectra/utils/format-units';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { usePaper } from '@/lib/firestore/queries/papers';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * PDF viewer using browser-native iframe (R178-1b-1 V1).
 *
 * Flow:
 *   1. Fetch signed URL from /api/papers/[id]/signed-download (15min TTL)
 *   2. Auto-refresh signed URL 60s before expiry (no UX interruption)
 *   3. iframe src = signed URL — browser handles render + a11y + keyboard nav
 *
 * Layout: top toolbar (back, title, download) + full-height iframe.
 *
 * @phase R178-1b-1
 */
interface SignedUrlResponse {
  url: string;
  expiresAt: number;
}

const REFRESH_BEFORE_EXPIRY_MS = 60_000;

async function fetchSignedUrl(paperId: string): Promise<SignedUrlResponse> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  const res = await fetch(`/api/papers/${paperId}/signed-download`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status}`);
  }
  return (await res.json()) as SignedUrlResponse;
}

export function PdfViewerIframe({ paperId }: { paperId: string }) {
  const t = useTranslations('papers');
  const params = useParams();
  const locale = params.locale as string;
  const { paper, loading: paperLoading } = usePaper(paperId);

  const [signed, setSigned] = useState<SignedUrlResponse | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setUrlError(null);
      const result = await fetchSignedUrl(paperId);
      setSigned(result);
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : 'fetch_failed');
    }
  }, [paperId]);

  // Initial load + schedule auto-refresh
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!signed) return;
    const msUntilRefresh = signed.expiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS;
    if (msUntilRefresh <= 0) {
      load();
      return;
    }
    refreshTimer.current = setTimeout(load, msUntilRefresh);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [signed, load]);

  const displayTitle = useMemo(() => paper?.title || t('untitled'), [paper?.title, t]);

  return (
    <div className='flex h-[calc(100vh-4rem)] flex-col'>
      <header className='flex items-center gap-3 border-b bg-background px-4 py-2.5'>
        <Button asChild variant='ghost' size='sm'>
          <Link href={`/${locale}/dashboard/papers/${paperId}`} aria-label={t('backToDetail')}>
            <IconArrowLeft data-icon='inline-start' />
            <span className='hidden sm:inline'>{t('backToDetail')}</span>
          </Link>
        </Button>
        <div className='min-w-0 flex-1'>
          <h1 className='truncate text-sm font-medium'>
            {paperLoading ? (
              <span className='text-muted-foreground'>{t('loading')}</span>
            ) : (
              formatSciNode(displayTitle)
            )}
          </h1>
          {paper && (
            <p className='truncate text-xs text-muted-foreground'>
              {paper.pageCount > 0 && `${t('nPages', { count: paper.pageCount })} · `}
              {(paper.fileSize / 1024 / 1024).toFixed(2)} MB · v{paper.version}
            </p>
          )}
        </div>
        {signed?.url && (
          <Button asChild variant='outline' size='sm'>
            <a href={signed.url} download rel='noopener noreferrer' aria-label={t('download')}>
              <IconDownload data-icon='inline-start' />
              <span className='hidden sm:inline'>{t('download')}</span>
            </a>
          </Button>
        )}
      </header>

      <div className='flex-1 bg-muted/30'>
        {urlError && (
          <div className='mx-auto max-w-2xl p-6'>
            <Alert variant='destructive'>
              <IconAlertCircle className='size-4' />
              <AlertTitle>{t('pdfLoadFailed')}</AlertTitle>
              <AlertDescription className='mt-2 space-y-3'>
                <p className='text-sm'>{urlError}</p>
                <Button variant='outline' size='sm' onClick={load}>
                  {t('retry')}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}
        {!urlError && !signed && (
          <div className='flex h-full justify-center p-4'>
            <Skeleton
              className='w-full max-w-2xl rounded-md'
              style={{ aspectRatio: '1 / 1.414' }}
            />
          </div>
        )}
        {!urlError && signed && (
          <iframe
            key={signed.url}
            src={signed.url}
            title={displayTitle}
            sandbox='allow-same-origin allow-popups'
            className='h-full w-full border-0'
          />
        )}
      </div>
    </div>
  );
}
