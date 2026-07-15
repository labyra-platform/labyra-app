'use client';

import { IconCheck, IconFile, IconUpload, IconX } from '@tabler/icons-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
/**
 * Drag-drop PDF upload component — 3-step signed URL flow (R168-3.2).
 *
 * Bypass Vercel 4.5MB body limit by uploading direct to Firebase Storage.
 *   Step 1: POST /api/papers/upload-url → get signed URL
 *   Step 2: PUT bytes to signed URL (direct Storage)
 *   Step 3: POST /api/papers/upload-complete → finalize + enqueue
 *
 * Fallback for small files (≤4.5MB): still uses old /api/papers/upload
 * endpoint while it exists (will be removed R169).
 *
 * @phase R160-ai-5b-1 base, R168-3.2 signed URL flow
 */
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { cn } from '@/lib/utils';

/** Human-readable file size (e.g. "3.2 MB"). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_FILES = 10; // batch upload cap (matches server rate-limit headroom)
const VERCEL_BODY_LIMIT = 4 * 1024 * 1024; // 4 MB (under 4.5 to leave headroom for multipart wrapping)

interface UploadResult {
  paperId: string;
  duplicate: boolean;
}

/**
 * Small-file path: legacy multipart POST (will be removed R169).
 * Used only when file ≤ VERCEL_BODY_LIMIT to keep simpler flow for tiny PDFs.
 */
async function uploadSmallPaper(file: File, token: string): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/papers/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (!res.ok) {
    const errData = (await res.json().catch(() => ({ error: 'upload_failed' }))) as {
      error?: string;
    };
    throw new Error(errData.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as UploadResult;
}

/**
 * Large-file path (R168-3.2): 3-step signed URL flow.
 *
 * Progress: roughly 5% (step 1 sign), 5-95% (step 2 upload), 95-100% (step 3 finalize).
 */
async function uploadLargePaper(
  file: File,
  token: string,
  onProgress: (pct: number) => void
): Promise<UploadResult> {
  // Step 1: request signed URL
  onProgress(2);
  const signRes = await fetch('/api/papers/upload-url', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sizeBytes: file.size,
      contentType: 'application/pdf',
      originalFilename: file.name
    })
  });
  if (!signRes.ok) {
    const errData = (await signRes.json().catch(() => ({ error: 'sign_failed' }))) as {
      error?: string;
    };
    throw new Error(errData.error ?? `HTTP ${signRes.status}`);
  }
  const { sessionId, signedUploadUrl } = (await signRes.json()) as {
    sessionId: string;
    signedUploadUrl: string;
  };
  onProgress(5);

  // Step 2: PUT bytes directly to Storage with XHR for progress tracking
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUploadUrl);
    xhr.setRequestHeader('Content-Type', 'application/pdf');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = 5 + (e.loaded / e.total) * 90; // 5-95
        onProgress(Math.round(pct));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`storage_put_${xhr.status}`));
    });
    xhr.addEventListener('error', () => reject(new Error('storage_put_network_error')));
    xhr.send(file);
  });
  onProgress(95);

  // Step 3: finalize
  const finRes = await fetch('/api/papers/upload-complete', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sessionId })
  });
  if (!finRes.ok) {
    const errData = (await finRes.json().catch(() => ({ error: 'finalize_failed' }))) as {
      error?: string;
    };
    throw new Error(errData.error ?? `HTTP ${finRes.status}`);
  }
  onProgress(100);
  return (await finRes.json()) as UploadResult;
}

async function uploadPaper(file: File, onProgress: (pct: number) => void): Promise<UploadResult> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  if (file.size <= VERCEL_BODY_LIMIT) {
    onProgress(50);
    const result = await uploadSmallPaper(file, token);
    onProgress(100);
    return result;
  }
  return uploadLargePaper(file, token, onProgress);
}

interface PaperItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'duplicate' | 'error';
  progress: number;
  error?: string;
}

export function UploadDropzone({
  onUploaded,
  onUploadingChange
}: {
  /** R237ap: when provided (e.g. inside the upload Sheet), called with the new
   *  paperId instead of navigating. The host decides what to do (close + open
   *  the paper). When omitted, falls back to navigating to the paper page so
   *  the standalone /papers/upload route still works. */
  onUploaded?: (paperId: string) => void;
  /** R259: report active-upload state so the host (Sheet) can block accidental
   *  dismiss during the actual byte transfer. */
  onUploadingChange?: (uploading: boolean) => void;
} = {}) {
  const t = useTranslations('papers');
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [items, setItems] = useState<PaperItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const patchItem = useCallback((id: string, patch: Partial<PaperItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  // Drop / pick just QUEUES files (review before upload) — capped at MAX_FILES.
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setItems((prev) => {
      const room = Math.max(0, MAX_FILES - prev.length);
      const added: PaperItem[] = acceptedFiles.slice(0, room).map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: 'pending',
        progress: 0
      }));
      return [...prev, ...added];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  // Upload every queued (or previously-failed) file, sequentially — sequential
  // keeps per-file progress clear and stays within the server upload rate-limit.
  const uploadAll = useCallback(async () => {
    const queued = items.filter((it) => it.status === 'pending' || it.status === 'error');
    if (queued.length === 0) return;
    setUploading(true);
    onUploadingChange?.(true);
    const toastId = toast.loading(t('uploading'), { description: `0/${queued.length}` });
    let done = 0;
    let lastPaperId: string | null = null;
    for (const it of queued) {
      patchItem(it.id, { status: 'uploading', progress: 0, error: undefined });
      try {
        const result = await uploadPaper(it.file, (pct) => patchItem(it.id, { progress: pct }));
        patchItem(it.id, { status: result.duplicate ? 'duplicate' : 'done', progress: 100 });
        lastPaperId = result.paperId;
        done += 1;
        toast.loading(t('uploading'), { id: toastId, description: `${done}/${queued.length}` });
      } catch (e) {
        patchItem(it.id, {
          status: 'error',
          error: e instanceof Error ? e.message : 'unknown_error'
        });
      }
    }
    setUploading(false);
    onUploadingChange?.(false);
    toast.success(t('uploadStarted'), { id: toastId, description: `${done}/${queued.length}` });
    if (lastPaperId && onUploaded) {
      onUploaded(lastPaperId);
    } else if (lastPaperId) {
      router.push(`/${locale}/dashboard/papers/${lastPaperId}`);
    }
  }, [items, t, router, locale, onUploaded, onUploadingChange, patchItem]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_FILE_SIZE,
    maxFiles: MAX_FILES,
    multiple: true,
    disabled: uploading || items.length >= MAX_FILES
  });

  const queuedCount = items.filter((it) => it.status === 'pending' || it.status === 'error').length;

  return (
    <div className='space-y-3'>
      {items.length < MAX_FILES && (
        <div
          {...getRootProps()}
          className={cn(
            'group cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors',
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          )}
        >
          <input {...getInputProps()} />
          <div className='flex flex-col items-center gap-2'>
            <IconUpload className='size-8 text-muted-foreground' aria-hidden />
            <div className='text-foreground text-sm font-normal'>
              {isDragActive
                ? t('dropHere')
                : t.rich('dragOrClick', {
                    cta: (chunks) => (
                      <span className='text-chart-2 font-medium underline-offset-2 group-hover:underline'>
                        {chunks}
                      </span>
                    )
                  })}
            </div>
            <div className='text-muted-foreground text-xs'>
              {t('maxSize', { mb: 100 })} · {t('uploadUpTo', { n: MAX_FILES })}
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className='space-y-2'>
          {items.map((it) => (
            <div key={it.id} className='flex items-center gap-3 rounded-lg border bg-card p-3'>
              <div className='flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
                <IconFile className='size-4' aria-hidden />
              </div>
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-medium'>{it.file.name}</p>
                <p className='text-xs text-muted-foreground'>{formatBytes(it.file.size)}</p>
                {it.status === 'uploading' && (
                  <div className='mt-1 h-1 w-full overflow-hidden rounded-full bg-muted'>
                    <div
                      className='h-full bg-primary transition-all'
                      style={{ width: `${it.progress}%` }}
                    />
                  </div>
                )}
                {it.status === 'error' && (
                  <p className='mt-1 text-xs text-destructive'>{it.error}</p>
                )}
              </div>
              {it.status === 'uploading' && (
                <span className='shrink-0 text-xs text-muted-foreground'>{it.progress}%</span>
              )}
              {it.status === 'done' && (
                <IconCheck className='size-4 shrink-0 text-emerald-600' aria-hidden />
              )}
              {it.status === 'duplicate' && (
                <span className='shrink-0 text-xs text-muted-foreground'>
                  {t('duplicateDetected')}
                </span>
              )}
              {it.status !== 'uploading' && (
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-8 shrink-0 text-muted-foreground hover:text-destructive'
                  onClick={() => removeItem(it.id)}
                  aria-label={t('removeFile')}
                  title={t('removeFile')}
                >
                  <IconX className='size-4' />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {queuedCount > 0 && (
        <div className='flex gap-2'>
          <Button onClick={uploadAll} disabled={uploading} className='flex-1'>
            <IconUpload className='size-4' />
            {t('uploadAll', { count: queuedCount })}
          </Button>
          <Button variant='outline' onClick={() => setItems([])} disabled={uploading}>
            {t('cancel')}
          </Button>
        </div>
      )}

      {fileRejections.length > 0 && (
        <div className='flex items-center gap-2 text-sm text-destructive'>
          <IconX className='size-4' aria-hidden />
          {fileRejections[0].errors[0]?.message ?? t('uploadFailed')}
        </div>
      )}
    </div>
  );
}
