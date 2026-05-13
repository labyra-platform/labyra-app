'use client';
/**
 * Spectrum upload dropzone with client-side sha256 calculation.
 * Flow: select file → calc sha256 → request signed URL → PUT to GCS → notify complete.
 * @phase R160-spectra-1
 */
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import { IconUpload, IconFile, IconCircleCheck, IconAlertCircle } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { SPECTRA_CONFIG, ALL_ACCEPTED_EXTENSIONS, detectSpectrumType } from '@/lib/spectra/config';
import type { SpectrumType } from '@/types/spectra';

interface SpectrumUploadProps {
  experimentId: string;
  sampleId: string;
  sampleLabel?: string;
  onComplete?: (spectrumId: string) => void;
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'hashing'; filename: string }
  | { phase: 'requesting' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'notifying' }
  | { phase: 'done'; spectrumId: string }
  | { phase: 'error'; message: string };

async function computeSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(hashBuf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function SpectrumUploadDropzone({
  experimentId,
  sampleId,
  sampleLabel,
  onComplete
}: SpectrumUploadProps) {
  const t = useTranslations('spectra');
  const [selectedType, setSelectedType] = useState<SpectrumType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>({ phase: 'idle' });

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    // Auto-detect type from filename
    const detected = detectSpectrumType(f.name);
    if (detected) {
      setSelectedType(detected);
    }
    setState({ phase: 'idle' });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { '*/*': ALL_ACCEPTED_EXTENSIONS }
  });

  const handleUpload = async () => {
    if (!file || !selectedType) {
      toast.error(t('selectTypeFirst'));
      return;
    }
    const config = SPECTRA_CONFIG[selectedType];
    if (file.size > config.maxSizeBytes) {
      toast.error(`File too large for ${selectedType}`);
      return;
    }

    try {
      // 1. Hash
      setState({ phase: 'hashing', filename: file.name });
      const sha256 = await computeSha256(file);

      // 2. Request signed URL
      setState({ phase: 'requesting' });
      const user = getAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();

      const sigRes = await fetch('/api/spectra/signed-upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          spectrumType: selectedType,
          originalFilename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          experimentId,
          sampleId
        })
      });
      if (!sigRes.ok) throw new Error(await sigRes.text());
      const { spectrumId, signedUrl, storagePath } = await sigRes.json();

      // 3. Upload to GCS via signed URL
      setState({ phase: 'uploading', progress: 0 });
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file
      });
      if (!uploadRes.ok) throw new Error('upload_failed');

      // 4. Notify complete
      setState({ phase: 'notifying' });
      const notifyRes = await fetch('/api/spectra/notify-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          spectrumId,
          storagePath,
          originalFilename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          sha256,
          spectrumType: selectedType,
          experimentId,
          sampleId,
          sampleLabel,
          measuredAt: Date.now()
        })
      });
      if (!notifyRes.ok) throw new Error(await notifyRes.text());

      setState({ phase: 'done', spectrumId });
      toast.success(t('uploadSuccess'));
      onComplete?.(spectrumId);

      // Reset for next upload
      setTimeout(() => {
        setFile(null);
        setSelectedType(null);
        setState({ phase: 'idle' });
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'upload_error';
      setState({ phase: 'error', message });
      toast.error(message);
    }
  };

  const phaseLabel = (() => {
    switch (state.phase) {
      case 'hashing':
        return t('phaseHashing');
      case 'requesting':
        return t('phaseRequesting');
      case 'uploading':
        return t('phaseUploading');
      case 'notifying':
        return t('phaseNotifying');
      case 'done':
        return t('phaseDone');
      case 'error':
        return `${t('phaseError')}: ${state.message}`;
      default:
        return null;
    }
  })();

  const isBusy = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error';

  return (
    <div className='space-y-4'>
      <div
        {...getRootProps()}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer',
          isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
          isBusy && 'pointer-events-none opacity-60'
        )}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className='flex flex-col items-center gap-2'>
            <IconFile className='size-8 text-muted-foreground' />
            <span className='font-medium'>{file.name}</span>
            <span className='text-xs text-muted-foreground'>
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
        ) : (
          <div className='flex flex-col items-center gap-2'>
            <IconUpload className='size-8 text-muted-foreground' />
            <span className='text-sm text-muted-foreground'>{t('dropHere')}</span>
            <span className='text-xs text-muted-foreground'>
              {ALL_ACCEPTED_EXTENSIONS.join(', ')}
            </span>
          </div>
        )}
      </div>

      {file && (
        <div className='space-y-1.5'>
          <Label>{t('spectrumType')} *</Label>
          <Select
            value={selectedType ?? ''}
            onValueChange={(v) => setSelectedType(v as SpectrumType)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('selectTypePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SPECTRA_CONFIG) as SpectrumType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`type.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {phaseLabel && (
        <div
          className={cn(
            'flex items-center gap-2 text-sm rounded-md p-2',
            state.phase === 'error' && 'bg-destructive/10 text-destructive',
            state.phase === 'done' && 'bg-green-500/10 text-green-700 dark:text-green-400'
          )}
        >
          {state.phase === 'done' ? (
            <IconCircleCheck className='size-4' />
          ) : state.phase === 'error' ? (
            <IconAlertCircle className='size-4' />
          ) : null}
          {phaseLabel}
        </div>
      )}

      <div className='flex justify-end'>
        <Button onClick={handleUpload} disabled={!file || !selectedType || isBusy}>
          {isBusy ? t('uploading') : t('upload')}
        </Button>
      </div>
    </div>
  );
}
