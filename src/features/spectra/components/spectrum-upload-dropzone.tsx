'use client';

/**
 * Multi-file spectrum upload dropzone.
 * - Drag-and-drop multiple files at once
 * - Per-file spectrum type dropdown (auto-detected from extension)
 * - Per-file status: pending → hashing → uploading → notifying → done | failed
 * - Concurrent upload: 3 files in parallel
 * @phase R160-spectra-3c-hotfix3
 */

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import {
  IconUpload,
  IconFile,
  IconCircleCheck,
  IconAlertCircle,
  IconX,
  IconLoader2
} from '@tabler/icons-react';

import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { SPECTRA_CONFIG, ALL_ACCEPTED_EXTENSIONS, detectSpectrumType } from '@/lib/spectra/config';
import type { SpectrumType } from '@/types/spectra';

interface SpectrumUploadProps {
  experimentId: string;
  sampleId: string;
  sampleLabel?: string;
  onComplete?: (spectrumIds: string[]) => void;
}

type ItemStatus =
  | { phase: 'pending' }
  | { phase: 'hashing' }
  | { phase: 'requesting' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'notifying' }
  | { phase: 'done'; spectrumId: string }
  | { phase: 'error'; message: string };

interface UploadItem {
  id: string; // local UUID for keying
  file: File;
  spectrumType: SpectrumType | null;
  chemicalFormula: string;
  anode: string;
  monochromator: string;
  profileFunction: string;
  zeroShift: number;
  status: ItemStatus;
}

const CONCURRENT_UPLOADS = 3;

function genId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function computeSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(hashBuf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function uploadOneFile(
  item: UploadItem,
  experimentId: string,
  sampleId: string,
  sampleLabel: string | undefined,
  updateStatus: (id: string, status: ItemStatus) => void
): Promise<string> {
  const { file, spectrumType, chemicalFormula, anode, monochromator, profileFunction, zeroShift } =
    item;
  if (!spectrumType) throw new Error('no_type_selected');

  const config = SPECTRA_CONFIG[spectrumType];
  if (file.size > config.maxSizeBytes) {
    throw new Error(`file_too_large_${spectrumType}`);
  }

  // 1. Hash
  updateStatus(item.id, { phase: 'hashing' });
  const sha256 = await computeSha256(file);

  // 2. Request signed URL
  updateStatus(item.id, { phase: 'requesting' });
  const user = getAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();

  const sigRes = await fetch('/api/spectra/signed-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      originalFilename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      spectrumType,
      experimentId,
      sampleId
    })
  });
  if (!sigRes.ok) throw new Error(`signed_url_failed_${sigRes.status}`);
  const { signedUrl, storagePath, spectrumId } = (await sigRes.json()) as {
    signedUrl: string;
    storagePath: string;
    spectrumId: string;
  };

  // 3. Upload via XHR for progress
  updateStatus(item.id, { phase: 'uploading', progress: 0 });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        updateStatus(item.id, { phase: 'uploading', progress: pct });
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload_${xhr.status}`));
    xhr.onerror = () => reject(new Error('upload_network_error'));
    xhr.send(file);
  });

  // 4. Notify complete
  updateStatus(item.id, { phase: 'notifying' });
  const notifyRes = await fetch('/api/spectra/notify-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      spectrumId,
      storagePath,
      originalFilename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      sha256,
      spectrumType,
      experimentId,
      sampleId,
      sampleLabel,
      chemicalFormula: chemicalFormula || undefined,
      anode: anode || 'Cu',
      monochromator: monochromator || 'none',
      profileFunction: profileFunction || 'pseudo_voigt',
      zeroShift: zeroShift || 0,
      measuredAt: Date.now()
    })
  });
  if (!notifyRes.ok) throw new Error(`notify_failed_${notifyRes.status}`);

  updateStatus(item.id, { phase: 'done', spectrumId });
  return spectrumId;
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = [];
  const executing: Set<Promise<void>> = new Set();

  for (const [idx, task] of tasks.entries()) {
    const p = task()
      .then(
        (value) => {
          results[idx] = { status: 'fulfilled', value };
        },
        (reason: unknown) => {
          results[idx] = { status: 'rejected', reason };
        }
      )
      .finally(() => {
        executing.delete(p);
      });
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}

export function SpectrumUploadDropzone({
  experimentId,
  sampleId,
  sampleLabel,
  onComplete
}: SpectrumUploadProps) {
  const t = useTranslations('spectra');
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const updateItemStatus = useCallback(
    (id: string, status: ItemStatus) => {
      updateItem(id, { status });
    },
    [updateItem]
  );

  const onDrop = useCallback((accepted: File[]) => {
    const newItems: UploadItem[] = accepted.map((file) => ({
      id: genId(),
      file,
      spectrumType: detectSpectrumType(file.name) ?? null,
      chemicalFormula: '',
      anode: 'Cu',
      monochromator: 'none',
      profileFunction: 'pseudo_voigt',
      zeroShift: 0,
      status: { phase: 'pending' }
    }));
    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: { '*/*': ALL_ACCEPTED_EXTENSIONS },
    disabled: isUploading
  });

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const changeType = (id: string, type: SpectrumType) => {
    updateItem(id, { spectrumType: type });
  };

  const changeFormula = (id: string, formula: string) => {
    updateItem(id, { chemicalFormula: formula });
  };

  const changeAnode = (id: string, anode: string) => {
    updateItem(id, { anode });
  };

  const changeMonochromator = (id: string, monochromator: string) => {
    updateItem(id, { monochromator });
  };

  const changeProfileFunction = (id: string, profileFunction: string) => {
    updateItem(id, { profileFunction });
  };

  const changeZeroShift = (id: string, zeroShift: number) => {
    updateItem(id, { zeroShift });
  };

  const startUpload = async () => {
    const pending = items.filter((it) => it.status.phase === 'pending');
    if (pending.length === 0) {
      toast.error(t('noFilesToUpload'));
      return;
    }
    if (pending.some((it) => !it.spectrumType)) {
      toast.error(t('selectTypeForAll'));
      return;
    }
    setIsUploading(true);
    const tasks = pending.map(
      (it) => () => uploadOneFile(it, experimentId, sampleId, sampleLabel, updateItemStatus)
    );

    const results = await runWithConcurrency(tasks, CONCURRENT_UPLOADS);
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    setIsUploading(false);

    if (succeeded > 0) {
      toast.success(t('uploadedCount', { count: succeeded }));
      const spectrumIds = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map((r) => r.value);
      onComplete?.(spectrumIds);
    }
    if (failed > 0) {
      toast.error(t('failedCount', { count: failed }));
    }
  };

  const clearCompleted = () => {
    setItems((prev) => prev.filter((it) => it.status.phase !== 'done'));
  };

  const totalCount = items.length;
  const doneCount = items.filter((it) => it.status.phase === 'done').length;
  const pendingCount = items.filter((it) => it.status.phase === 'pending').length;

  return (
    <div className='flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden'>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          isUploading && 'pointer-events-none opacity-50'
        )}
      >
        <input {...getInputProps()} />
        <IconUpload className='h-10 w-10 text-muted-foreground' stroke={1.5} />
        <p className='mt-2 text-sm text-muted-foreground'>
          {isDragActive ? t('dropFilesHere') : t('dragOrClickMulti')}
        </p>
        <p className='mt-1 text-xs text-muted-foreground'>{t('multiFileHint')}</p>
      </div>

      {/* Queue list */}
      {items.length > 0 && (
        <div className='space-y-2'>
          <div className='flex items-center justify-between text-sm'>
            <span className='text-muted-foreground'>
              {t('queueStatus', { total: totalCount, done: doneCount, pending: pendingCount })}
            </span>
            {doneCount > 0 && !isUploading && (
              <Button variant='ghost' size='sm' onClick={clearCompleted}>
                {t('clearCompleted')}
              </Button>
            )}
          </div>

          <div className='rounded-md border p-1'>
            <div className='max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain p-1 pr-2'>
              {items.map((item) => (
                <UploadRow
                  key={item.id}
                  item={item}
                  disabled={isUploading}
                  onTypeChange={(type) => changeType(item.id, type)}
                  onFormulaChange={(f) => changeFormula(item.id, f)}
                  onAnodeChange={(a) => changeAnode(item.id, a)}
                  onMonochromatorChange={(m) => changeMonochromator(item.id, m)}
                  onProfileFunctionChange={(p) => changeProfileFunction(item.id, p)}
                  onZeroShiftChange={(z) => changeZeroShift(item.id, z)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {items.length > 0 && (
        <div className='flex justify-end gap-2'>
          {!isUploading && (
            <Button variant='outline' onClick={() => setItems([])} disabled={isUploading}>
              {t('clearAll')}
            </Button>
          )}
          <Button onClick={startUpload} disabled={isUploading || pendingCount === 0}>
            {isUploading ? (
              <>
                <IconLoader2 className='mr-2 h-4 w-4 animate-spin' />
                {t('uploading')}
              </>
            ) : (
              t('uploadCount', { count: pendingCount })
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// UploadRow — single file row with type dropdown + status
// ============================================================

interface UploadRowProps {
  item: UploadItem;
  disabled: boolean;
  onTypeChange: (type: SpectrumType) => void;
  onFormulaChange: (formula: string) => void;
  onAnodeChange: (anode: string) => void;
  onMonochromatorChange: (monochromator: string) => void;
  onProfileFunctionChange: (profile: string) => void;
  onZeroShiftChange: (zeroShift: number) => void;
  onRemove: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadRow({
  item,
  disabled,
  onTypeChange,
  onFormulaChange,
  onAnodeChange,
  onMonochromatorChange,
  onProfileFunctionChange,
  onZeroShiftChange,
  onRemove
}: UploadRowProps) {
  const t = useTranslations('spectra');
  const chemicalFormula = item.chemicalFormula;
  const anode = item.anode;
  const monochromator = item.monochromator;
  const profileFunction = item.profileFunction;
  const zeroShift = item.zeroShift;
  const spectrumType = item.spectrumType;
  const status = item.status;
  const file = item.file;
  const canEdit = status.phase === 'pending';
  const canRemove = canEdit || status.phase === 'done' || status.phase === 'error';

  return (
    <div className='flex items-center gap-3 rounded-md border bg-card p-3'>
      <IconFile className='h-5 w-5 flex-shrink-0 text-muted-foreground' />

      <div className='flex-1 min-w-0'>
        <div className='flex items-baseline gap-2'>
          <span className='truncate text-sm font-medium'>{file.name}</span>
          <span className='flex-shrink-0 text-xs text-muted-foreground'>
            {formatBytes(file.size)}
          </span>
        </div>

        {status.phase === 'uploading' && (
          <div className='mt-1.5'>
            <Progress value={status.progress} className='h-1' />
            <p className='mt-0.5 text-xs text-muted-foreground'>{status.progress}%</p>
          </div>
        )}

        {status.phase === 'error' && (
          <p className='mt-1 text-xs text-destructive'>
            {t(`errors.${status.message}`, { default: status.message })}
          </p>
        )}
      </div>

      <div className='flex flex-shrink-0 items-center gap-2'>
        <Select
          value={spectrumType ?? undefined}
          onValueChange={(v) => onTypeChange(v as SpectrumType)}
          disabled={!canEdit || disabled}
        >
          <SelectTrigger className='w-28 lg:w-32'>
            <SelectValue placeholder={t('selectType')} />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SPECTRA_CONFIG).map(([type, _cfg]) => (
              <SelectItem key={type} value={type}>
                {t.has(`type.${type}`) ? t(`type.${type}`) : type.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type='text'
          placeholder={t.has('formulaPlaceholder') ? t('formulaPlaceholder') : 'WO3'}
          value={chemicalFormula}
          onChange={(e) => onFormulaChange(e.target.value)}
          disabled={!canEdit || disabled}
          className='w-20 text-xs'
        />
        {spectrumType === 'xrd' && (
          <>
            <Select
              value={anode || 'Cu'}
              onValueChange={(v) => onAnodeChange(v)}
              disabled={!canEdit || disabled}
            >
              <SelectTrigger className='w-20 text-xs'>
                <SelectValue placeholder='Cu' />
              </SelectTrigger>
              <SelectContent>
                {['Cu', 'Mo', 'Co', 'Cr', 'Fe', 'Ag'].map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}-Kα
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={monochromator || 'none'}
              onValueChange={(v) => onMonochromatorChange(v)}
              disabled={!canEdit || disabled}
            >
              <SelectTrigger className='w-24 text-xs'>
                <SelectValue placeholder='None' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='none'>None</SelectItem>
                <SelectItem value='ni_filter'>Ni filter</SelectItem>
                <SelectItem value='graphite'>Graphite</SelectItem>
                <SelectItem value='ge111'>Ge(111)</SelectItem>
                <SelectItem value='johansson'>Johansson</SelectItem>
                <SelectItem value='si220'>Si(220)</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={profileFunction || 'pseudo_voigt'}
              onValueChange={(v) => onProfileFunctionChange(v)}
              disabled={!canEdit || disabled}
            >
              <SelectTrigger className='w-28 text-xs' title='Peak profile function'>
                <SelectValue placeholder='Pseudo-Voigt' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='gaussian'>Gaussian</SelectItem>
                <SelectItem value='lorentzian'>Lorentzian</SelectItem>
                <SelectItem value='pseudo_voigt'>Pseudo-Voigt</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type='number'
              step='0.001'
              value={zeroShift ?? 0}
              onChange={(e) => onZeroShiftChange(Number.parseFloat(e.target.value) || 0)}
              disabled={!canEdit || disabled}
              className='w-20 text-xs'
              placeholder='Δ2θ'
              title='Zero shift correction (°)'
            />
          </>
        )}
      </div>

      <StatusBadge status={status} />

      <Button
        variant='ghost'
        size='sm'
        onClick={onRemove}
        disabled={!canRemove}
        className='flex-shrink-0'
      >
        <IconX className='h-4 w-4' />
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: ItemStatus }) {
  const t = useTranslations('spectra');
  switch (status.phase) {
    case 'pending':
      return (
        <span className='flex-shrink-0 text-xs text-muted-foreground'>{t('status.pending')}</span>
      );
    case 'hashing':
    case 'requesting':
    case 'notifying':
      return (
        <span className='flex items-center gap-1 flex-shrink-0 text-xs text-muted-foreground'>
          <IconLoader2 className='h-3 w-3 animate-spin' />
          {t(`status.${status.phase}`)}
        </span>
      );
    case 'uploading':
      return (
        <span className='flex items-center gap-1 flex-shrink-0 text-xs text-blue-600 dark:text-blue-400'>
          <IconLoader2 className='h-3 w-3 animate-spin' />
          {t('status.uploading')}
        </span>
      );
    case 'done':
      return (
        <span className='flex items-center gap-1 flex-shrink-0 text-xs text-green-600 dark:text-green-400'>
          <IconCircleCheck className='h-3 w-3' />
          {t('status.done')}
        </span>
      );
    case 'error':
      return (
        <span className='flex items-center gap-1 flex-shrink-0 text-xs text-destructive'>
          <IconAlertCircle className='h-3 w-3' />
          {t('status.failed')}
        </span>
      );
  }
}
