'use client';

/**
 * Drag-drop PDF upload component.
 * @phase R160-ai-5b-1
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

interface UploadResult {
  paperId: string;
  duplicate: boolean;
}

async function uploadPaper(file: File): Promise<UploadResult> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();

  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/papers/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'upload_failed' }));
    throw new Error(errData.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as UploadResult;
}

export function UploadDropzone() {
  const t = useTranslations('papers');
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setError(null);
      setUploading(true);

      try {
        const result = await uploadPaper(file);
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
            <IconLoader2 className='size-12 animate-spin text-muted-foreground' />
          ) : (
            <IconUpload className='size-12 text-muted-foreground' />
          )}
          <div className='space-y-1'>
            <p className='text-sm font-medium'>
              {uploading ? t('uploading') : isDragActive ? t('dropToUpload') : t('dragOrClick')}
            </p>
            <p className='text-muted-foreground text-xs'>{t('pdfOnlyMax', { mb: 50 })}</p>
          </div>
        </div>
      </div>

      {fileRejections.length > 0 && (
        <div className='space-y-1'>
          {fileRejections.map(({ file, errors }) => (
            <div key={file.name} className='text-destructive text-xs flex items-center gap-2'>
              <IconX className='size-3.5' />
              <span>
                <IconFile className='inline size-3 mr-1' />
                {file.name}: {errors.map((e) => e.message).join(', ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className='text-destructive text-sm bg-destructive/5 border border-destructive/20 rounded p-3'>
          {error}
        </div>
      )}
    </div>
  );
}
