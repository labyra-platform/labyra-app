'use client';

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
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { IconUpload, IconFile, IconX, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import { getFirebaseAuth } from '@/lib/firebase/client';

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

export function UploadDropzone() {
  const t = useTranslations('papers');
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setError(null);
      setUploading(true);
      setProgress(0);

      try {
        const result = await uploadPaper(file, setProgress);
        if (result.duplicate) {
          toast.info(t('duplicateDetected'));
        } else {
          toast.success(t('uploadStarted'));
        }
        router.push(`/${locale}/dashboard/papers/${result.paperId}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown_error';
        setError(msg);
        toast.error(t('uploadFailed'), { description: msg });
      } finally {
        setUploading(false);
      }
    },
    [t, router, locale]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_FILE_SIZE,
    maxFiles: 1,
    disabled: uploading
  });

  return (
    <div className='space-y-3'>
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          uploading && 'cursor-not-allowed opacity-50'
        )}
      >
        <input {...getInputProps()} />
        <div className='flex flex-col items-center gap-3'>
          {uploading ? (
            <>
              <IconLoader2 className='size-10 animate-spin text-primary' aria-hidden />
              <div className='text-sm font-medium'>{t('uploading')}</div>
              <div className='w-full max-w-xs h-1.5 bg-muted rounded-full overflow-hidden'>
                <div
                  className='h-full bg-primary transition-all'
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className='text-xs text-muted-foreground'>{progress}%</div>
            </>
          ) : (
            <>
              <IconUpload className='size-10 text-muted-foreground' aria-hidden />
              <div className='text-sm font-medium'>
                {isDragActive ? t('dropHere') : t('dragOrClick')}
              </div>
              <div className='text-xs text-muted-foreground'>{t('maxSize', { mb: 50 })}</div>
            </>
          )}
        </div>
      </div>

      {fileRejections.length > 0 && (
        <div className='text-sm text-destructive flex items-center gap-2'>
          <IconX className='size-4' aria-hidden />
          {fileRejections[0].errors[0]?.message ?? t('uploadFailed')}
        </div>
      )}

      {error && (
        <div className='text-sm text-destructive flex items-center gap-2'>
          <IconFile className='size-4' aria-hidden />
          {error}
        </div>
      )}
    </div>
  );
}
