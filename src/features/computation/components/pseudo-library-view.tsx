/**
 * PseudoLibraryView — the tenant's pseudopotential library. A sortable table of
 * uploaded UPFs with the author-suggested minimum cutoffs parsed from each
 * file's PP_HEADER (wfc_cutoff / rho_cutoff, in Ry) — the values the composer's
 * global ecutwfc/ecutrho should meet or exceed. Upload adds to the shared
 * GCS pseudo/ prefix staged into every run.
 *
 * @phase R353-pseudo-library
 */
'use client';

import { IconLoader2, IconUpload } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableHead, useSortRows } from '@/components/ui-extra/sortable-head';

interface PseudoRow {
  filename: string;
  element: string | null;
  size: number | null;
  ecutwfc: number | null;
  ecutrho: number | null;
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

const fmtRy = (v: number | null) => (v && v > 0 ? `${Math.round(v)} Ry` : '—');
const fmtSize = (b: number | null) =>
  b == null ? '—' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

export function PseudoLibraryView() {
  const t = useTranslations('computation');
  const [rows, setRows] = useState<PseudoRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/dft/pseudo/list');
      if (!res.ok) {
        setError('Failed to load pseudopotential library');
        return;
      }
      const data = (await res.json()) as { pseudos?: PseudoRow[] };
      setRows(data.pseudos ?? []);
      setError(null);
    } catch {
      setError('Failed to load pseudopotential library');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sortable = useSortRows(rows ?? [], {
    filename: (r) => r.filename,
    element: (r) => r.element,
    ecutwfc: (r) => r.ecutwfc,
    ecutrho: (r) => r.ecutrho,
    size: (r) => r.size
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const contentB64 = await fileToB64(file);
      const res = await fetch('/api/dft/pseudo/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentB64 })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Upload failed');
        return;
      }
      await refresh();
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <p className='text-muted-foreground max-w-2xl text-sm'>{t('pseudoLibraryHint')}</p>
        <Button variant='outline' disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? (
            <IconLoader2 className='mr-2 size-4 animate-spin' />
          ) : (
            <IconUpload className='mr-2 size-4' />
          )}
          {t('pseudoUpload')}
        </Button>
        <input
          ref={fileRef}
          type='file'
          accept='.upf,.UPF'
          className='hidden'
          aria-label={t('pseudoUpload')}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>

      {error ? <p className='text-destructive text-sm'>{error}</p> : null}

      {rows === null ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          <IconLoader2 className='mr-2 inline size-4 animate-spin' />
          {t('pseudoLoading')}
        </p>
      ) : rows.length === 0 ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>{t('pseudoEmpty')}</p>
      ) : (
        <div className='overflow-hidden rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label={t('pseudoColFile')}
                  sortKey='filename'
                  activeKey={sortable.sortKey}
                  dir={sortable.dir}
                  onToggle={sortable.toggle}
                />
                <SortableHead
                  label={t('pseudoColElement')}
                  sortKey='element'
                  activeKey={sortable.sortKey}
                  dir={sortable.dir}
                  onToggle={sortable.toggle}
                />
                <SortableHead
                  label={t('pseudoColEcutwfc')}
                  sortKey='ecutwfc'
                  align='right'
                  activeKey={sortable.sortKey}
                  dir={sortable.dir}
                  onToggle={sortable.toggle}
                />
                <SortableHead
                  label={t('pseudoColEcutrho')}
                  sortKey='ecutrho'
                  align='right'
                  activeKey={sortable.sortKey}
                  dir={sortable.dir}
                  onToggle={sortable.toggle}
                />
                <SortableHead
                  label={t('pseudoColSize')}
                  sortKey='size'
                  align='right'
                  activeKey={sortable.sortKey}
                  dir={sortable.dir}
                  onToggle={sortable.toggle}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortable.sorted.map((r) => (
                <TableRow key={r.filename}>
                  <TableCell className='font-mono text-xs'>{r.filename}</TableCell>
                  <TableCell className='font-medium'>{r.element ?? '—'}</TableCell>
                  <TableCell className='text-right tabular-nums'>{fmtRy(r.ecutwfc)}</TableCell>
                  <TableCell className='text-right tabular-nums'>{fmtRy(r.ecutrho)}</TableCell>
                  <TableCell className='text-muted-foreground text-right tabular-nums'>
                    {fmtSize(r.size)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
