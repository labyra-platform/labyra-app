'use client';

import { IconFile, IconUpload, IconX } from '@tabler/icons-react';
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

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
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

export function UploadDropzone({
  onUploaded
}: {
  /** R237ap: when provided (e.g. inside the upload Sheet), called with the new
   *  paperId instead of navigating. The host decides what to do (close + open
   *  the paper). When omitted, falls back to navigating to the paper page so
   *  the standalone /papers/upload route still works. */
  onUploaded?: (paperId: string) => void;
} = {}) {
  const t = useTranslations('papers');
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Drop / pick just SELECTS the file (R237at) — the user reviews the name +
  // size, then presses "Upload". Avoids burning an upload on the wrong file.
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setError(null);
    setProgress(0);
    setSelectedFile(file);
  }, []);

  const startUpload = useCallback(async () => {
    if (!selectedFile) return;
    setError(null);
    setUploading(true);
    setProgress(0);
    try {
      const result = await uploadPaper(selectedFile, setProgress);
      if (result.duplicate) {
        toast.info(t('duplicateDetected'));
      } else {
        toast.success(t('uploadStarted'));
      }
      if (onUploaded) {
        onUploaded(result.paperId);
      } else {
        router.push(`/${locale}/dashboard/papers/${result.paperId}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown_error';
      setError(msg);
      toast.error(t('uploadFailed'), { description: msg });
    } finally {
      setUploading(false);
    }
  }, [selectedFile, t, router, locale, onUploaded]);

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setProgress(0);
    setError(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_FILE_SIZE,
    maxFiles: 1,
    disabled: uploading || selectedFile !== null
  });

  return (
    <div className='space-y-3'>
      {selectedFile ? (
        // File chosen — show name + size, let the user confirm or remove.
        <div className='rounded-lg border bg-card p-4'>
          <div className='flex items-start gap-3'>
            <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
              <IconFile className='size-5' aria-hidden />
            </div>
            <div className='min-w-0 flex-1'>
              <p className='truncate text-sm font-medium'>{selectedFile.name}</p>
              <p className='text-xs text-muted-foreground'>{formatBytes(selectedFile.size)}</p>
            </div>
            {!uploading && (
              <Button
                variant='ghost'
                size='icon'
                className='size-8 shrink-0 text-muted-foreground hover:text-destructive'
                onClick={clearFile}
                aria-label={t('removeFile')}
                title={t('removeFile')}
              >
                <IconX className='size-4' />
              </Button>
            )}
          </div>

          {uploading ? (
            <div className='mt-4 space-y-1.5'>
              <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                <div
                  className='h-full bg-primary transition-all'
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className='text-xs text-muted-foreground'>
                {t('uploading')} · {progress}%
              </p>
            </div>
          ) : (
            <div className='mt-4 flex gap-2'>
              <Button onClick={startUpload} className='flex-1'>
                <IconUpload className='size-4' />
                {t('uploadNew')}
              </Button>
              <Button variant='outline' onClick={clearFile}>
                {t('cancel')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            'cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors',
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          )}
        >
          <input {...getInputProps()} />
          <div className='flex flex-col items-center gap-3'>
            <IconUpload className='size-10 text-muted-foreground' aria-hidden />
            <div className='text-sm font-medium'>
              {isDragActive ? t('dropHere') : t('dragOrClick')}
            </div>
            <div className='text-xs text-muted-foreground'>{t('maxSize', { mb: 50 })}</div>
          </div>
        </div>
      )}

      {fileRejections.length > 0 && (
        <div className='flex items-center gap-2 text-sm text-destructive'>
          <IconX className='size-4' aria-hidden />
          {fileRejections[0].errors[0]?.message ?? t('uploadFailed')}
        </div>
      )}

      {error && (
        <div className='flex items-center gap-2 text-sm text-destructive'>
          <IconFile className='size-4' aria-hidden />
          {error}
        </div>
      )}
    </div>
  );
}
