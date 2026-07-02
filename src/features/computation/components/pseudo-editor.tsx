/**
 * PseudoEditor — ATOMIC_SPECIES pseudopotential assignment. Lists the tenant's
 * uploaded UPFs (GCS pseudo/ library) and lets the user assign one per element;
 * the chosen filename lands in the ATOMIC_SPECIES card (global.pseudoMap →
 * worker). A .UPF can be uploaded inline and is auto-assigned to its element.
 *
 * @phase R344-pseudo-upload
 */
'use client';

import { IconLoader2, IconUpload } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

const NONE = '__none__';

interface PseudoInfo {
  filename: string;
  element: string | null;
}

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const s = String(reader.result);
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    });
    reader.addEventListener('error', () => reject(new Error('read failed')));
    reader.readAsDataURL(file);
  });
}

export function PseudoEditor({
  species,
  value,
  onChange
}: {
  species: string[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const [available, setAvailable] = useState<PseudoInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/dft/pseudo/list');
      if (res.ok) {
        const data = (await res.json()) as { pseudos?: PseudoInfo[] };
        setAvailable(data.pseudos ?? []);
      }
    } catch {
      // leave the list as-is; upload/assign still work once reachable
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Dropdown options = uploaded UPFs ∪ any already-assigned filename (so a stale
  // assignment still shows even if the file is missing from the current listing).
  const options = useMemo(() => {
    const set = new Set(available.map((p) => p.filename));
    for (const f of Object.values(value)) if (f) set.add(f);
    return Array.from(set).toSorted((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [available, value]);

  const assign = (element: string, filename: string) => {
    const next = { ...value };
    if (filename === NONE) delete next[element];
    else next[element] = filename;
    onChange(next);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const contentB64 = await fileToB64(file);
      const res = await fetch('/api/dft/pseudo/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentB64 })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(data?.error ?? 'Upload failed');
        return;
      }
      const info = (await res.json()) as PseudoInfo;
      await refresh();
      if (info.element && species.includes(info.element)) assign(info.element, info.filename);
    } catch {
      setErr('Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className='space-y-2 border-t pt-3'>
      <div className='flex items-center justify-between'>
        <p className='font-mono text-xs font-medium'>ATOMIC_SPECIES — pseudopotentials</p>
        <Button
          variant='outline'
          size='sm'
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <IconLoader2 className='mr-1 size-4 animate-spin' />
          ) : (
            <IconUpload className='mr-1 size-4' />
          )}
          Upload .UPF
        </Button>
        <input
          ref={fileRef}
          type='file'
          accept='.upf,.UPF'
          className='hidden'
          aria-label='Upload pseudopotential UPF'
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      {err ? <p className='text-destructive text-xs'>{err}</p> : null}
      {species.length === 0 ? (
        <p className='text-muted-foreground text-xs'>
          Load a structure to assign pseudopotentials.
        </p>
      ) : (
        species.map((el) => (
          <div key={el} className='flex items-center gap-2'>
            <span className='w-10 font-mono text-sm'>{el}</span>
            <Select value={value[el] ?? NONE} onValueChange={(v) => assign(el, v)}>
              <SelectTrigger className='h-8 flex-1'>
                <SelectValue placeholder='— assign UPF —' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— none —</SelectItem>
                {options.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!value[el] ? <span className='text-muted-foreground text-xs'>unassigned</span> : null}
          </div>
        ))
      )}
      {options.length === 0 && species.length > 0 ? (
        <p className='text-muted-foreground text-xs'>
          No UPFs yet — upload the .UPF files for {species.join(', ')}.
        </p>
      ) : null}
    </div>
  );
}
