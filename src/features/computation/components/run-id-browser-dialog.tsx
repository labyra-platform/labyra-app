/**
 * RunIdBrowserDialog — lists the workflows that already exist so the composer
 * knows which runIDs are taken, and lets the user deliberately reuse one (which
 * overwrites on launch) or delete an old run. Overwrite/delete are guarded by a
 * confirmation in the parent (launch) / here (delete). @phase R384
 */
'use client';

import { IconLoader2, IconTrash } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

export interface ExistingRun {
  id: string;
  name: string;
  status?: string | null;
  createdAt?: number | null;
}

const p2 = (n: number) => String(n).padStart(2, '0');
function fmtWhen(ms: number | null | undefined): string {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const statusColor: Record<string, string> = {
  completed: 'text-emerald-600',
  running: 'text-blue-600',
  queued: 'text-amber-600',
  failed: 'text-destructive'
};

export function RunIdBrowserDialog({
  open,
  onOpenChange,
  currentJobId,
  onReuse
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The effective job id currently composed — highlighted if it collides. */
  currentJobId: string;
  /** Called with a run's id when the user chooses to reuse (overwrite) it. */
  onReuse: (run: ExistingRun) => void;
}) {
  const t = useTranslations('computation');
  const [runs, setRuns] = useState<ExistingRun[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/dft/workflows');
      const data = (await res.json()) as { workflows?: ExistingRun[] };
      setRuns(data.workflows ?? []);
    } catch {
      setRuns([]);
    }
  };
  useEffect(() => {
    if (open) void load();
  }, [open]);

  const del = async (id: string) => {
    if (!confirm(t('runIdDeleteConfirm', { id }))) return;
    setDeleting(id);
    try {
      await fetch(`/api/dft/workflows/${id}`, { method: 'DELETE' });
      setRuns((prev) => (prev ?? []).filter((r) => r.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex h-[70vh] max-h-[640px] flex-col sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('runIdBrowseTitle')}</DialogTitle>
          <DialogDescription>{t('runIdBrowseDesc')}</DialogDescription>
        </DialogHeader>
        <div className='min-h-0 flex-1 space-y-1 overflow-y-auto pr-1'>
          {runs === null ? (
            <div className='text-muted-foreground py-8 text-center'>
              <IconLoader2 className='mx-auto size-5 animate-spin' />
            </div>
          ) : runs.length === 0 ? (
            <p className='text-muted-foreground py-8 text-center text-sm'>
              {t('runIdBrowseEmpty')}
            </p>
          ) : (
            runs.map((r) => {
              const collides = r.id === currentJobId;
              return (
                <div
                  key={r.id}
                  className={`flex items-center justify-between rounded border px-3 py-2 ${
                    collides ? 'border-amber-500 bg-amber-500/5' : ''
                  }`}
                >
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <span className='truncate font-mono text-sm'>{r.id}</span>
                      {r.status ? (
                        <span
                          className={`text-[10px] ${statusColor[r.status] ?? 'text-muted-foreground'}`}
                        >
                          {r.status}
                        </span>
                      ) : null}
                    </div>
                    <span className='text-muted-foreground text-[11px]'>
                      {r.name}
                      {r.createdAt ? ` · ${fmtWhen(r.createdAt)}` : ''}
                      {collides ? ` · ${t('runIdCollidesTag')}` : ''}
                    </span>
                  </div>
                  <div className='flex shrink-0 items-center gap-1'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        onReuse(r);
                        onOpenChange(false);
                      }}
                    >
                      {t('runIdReuse')}
                    </Button>
                    <Button
                      size='icon'
                      variant='ghost'
                      className='size-7'
                      disabled={deleting === r.id}
                      onClick={() => void del(r.id)}
                      aria-label={t('runIdDelete')}
                    >
                      {deleting === r.id ? (
                        <IconLoader2 className='size-4 animate-spin' />
                      ) : (
                        <IconTrash className='size-4' />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
