'use client';

/**
 * SI file drop + list (R490) — lives inside the Supplementary Information card
 * of the citations panel. Drag/drop or pick a PDF/ZIP → signed-URL PUT straight
 * to GCS → attach on the paper doc. Server enforces group scope + write role.
 */
import { IconFile, IconLoader2, IconUpload, IconX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { cn } from '@/lib/utils';

interface SiItem {
  name: string;
  sizeBytes: number;
  url: string;
}

const MAX_SIZE = 100 * 1024 * 1024;
const ACCEPT = new Set(['application/pdf', 'application/zip', 'application/x-zip-compressed']);

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

async function authHeader(): Promise<{ Authorization: string }> {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  return { Authorization: `Bearer ${token ?? ''}` };
}

export function SiFiles({ paperId }: { paperId: string }) {
  const t = useTranslations('papers');
  const [items, setItems] = useState<SiItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/papers/${paperId}/si`, { headers: await authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: SiItem[] };
      setItems(data.items);
    } catch {
      setItems([]);
    }
  }, [paperId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      if (!ACCEPT.has(file.type)) {
        setError(t('siWrongType'));
        return;
      }
      if (file.size > MAX_SIZE) {
        setError(t('siTooLarge'));
        return;
      }
      setUploading(true);
      try {
        const headers = { ...(await authHeader()), 'Content-Type': 'application/json' };
        const signRes = await fetch(`/api/papers/${paperId}/si`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size
          })
        });
        if (!signRes.ok) throw new Error(`sign HTTP ${signRes.status}`);
        const { signedUploadUrl, filename } = (await signRes.json()) as {
          signedUploadUrl: string;
          filename: string;
        };
        const putRes = await fetch(signedUploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        });
        if (!putRes.ok) throw new Error(`put HTTP ${putRes.status}`);
        const attachRes = await fetch(`/api/papers/${paperId}/si`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ filename })
        });
        if (!attachRes.ok) throw new Error(`attach HTTP ${attachRes.status}`);
        await load();
      } catch {
        setError(t('siUploadFailed'));
      } finally {
        setUploading(false);
      }
    },
    [paperId, t, load]
  );

  const remove = useCallback(
    async (name: string) => {
      try {
        const res = await fetch(`/api/papers/${paperId}/si?filename=${encodeURIComponent(name)}`, {
          method: 'DELETE',
          headers: await authHeader()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await load();
      } catch {
        setError(t('siDeleteFailed'));
      }
    },
    [paperId, t, load]
  );

  return (
    <div className='mt-2 space-y-1.5'>
      {(items ?? []).map((f) => (
        <div key={f.name} className='flex items-center gap-1.5 text-xs'>
          <IconFile className='size-3.5 shrink-0 text-muted-foreground' aria-hidden />
          <a
            href={f.url}
            target='_blank'
            rel='noopener noreferrer'
            className='min-w-0 truncate text-primary hover:underline'
            title={f.name}
          >
            {f.name}
          </a>
          <span className='shrink-0 text-[10px] text-muted-foreground'>{fmtSize(f.sizeBytes)}</span>
          <button
            type='button'
            onClick={() => void remove(f.name)}
            aria-label={t('siRemove', { name: f.name })}
            className='ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive'
          >
            <IconX className='size-3' aria-hidden />
          </button>
        </div>
      ))}

      <button
        type='button'
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={cn(
          'flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground transition-colors',
          dragOver ? 'border-primary bg-primary/5 text-foreground' : 'hover:border-primary/50',
          uploading && 'opacity-60'
        )}
      >
        {uploading ? (
          <IconLoader2 className='size-3.5 animate-spin' aria-hidden />
        ) : (
          <IconUpload className='size-3.5' aria-hidden />
        )}
        {uploading ? t('siUploading') : t('siDropHint')}
      </button>
      <input
        ref={inputRef}
        type='file'
        accept='.pdf,.zip,application/pdf,application/zip'
        aria-label={t('siDropHint')}
        className='hidden'
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
      {error && <p className='text-xs text-destructive'>{error}</p>}
    </div>
  );
}
