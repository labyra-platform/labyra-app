'use client';

/**
 * Manuscripts page shell — master/detail. Left: the manuscript list + a "New
 * manuscript" dialog (title + the curated collection that scopes its RAG).
 * Right: the editor for the selected manuscript. A manuscript REQUIRES a
 * collection (its grounded source), so creation is disabled until one exists.
 *
 * @phase R-aiscience-4
 */
import { IconFileText, IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ManuscriptCanvas } from '@/features/manuscript/components/manuscript-canvas';
import { useManuscripts } from '@/features/manuscript/use-manuscripts';
import { useCollections } from '@/features/papers/collections/use-collections';
import { useTenantId } from '@/lib/auth';
import { createManuscript } from '@/lib/firestore/queries/manuscripts';
import { cn } from '@/lib/utils';

export function ManuscriptsView() {
  const t = useTranslations('manuscript');
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const { manuscripts, isLoading } = useManuscripts();
  const { collections } = useCollections();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);

  const selected = manuscripts.find((m) => m.id === selectedId) ?? null;

  async function create() {
    const trimmed = title.trim();
    if (!tenantId || !trimmed || !collectionId) return;
    setBusy(true);
    try {
      const id = await createManuscript(tenantId, { title: trimmed, collectionId });
      await queryClient.invalidateQueries({
        queryKey: ['tenant-collection', tenantId, 'manuscripts']
      });
      setSelectedId(id);
      setCreateOpen(false);
      setTitle('');
      setCollectionId('');
    } catch {
      toast.error(t('createFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='flex min-h-0 flex-1 gap-4'>
      <aside className={cn('w-52 shrink-0 space-y-2', focused && 'hidden')}>
        <Button
          className='w-full'
          onClick={() => setCreateOpen(true)}
          disabled={collections.length === 0}
        >
          <IconPlus className='size-4' />
          {t('newManuscript')}
        </Button>
        {collections.length === 0 && (
          <p className='text-xs text-muted-foreground'>{t('needCollection')}</p>
        )}

        {isLoading ? (
          <p className='text-xs text-muted-foreground'>{t('loading')}</p>
        ) : manuscripts.length === 0 ? (
          <p className='text-xs text-muted-foreground'>{t('empty')}</p>
        ) : (
          <div className='space-y-px'>
            {manuscripts.map((m) => (
              <button
                key={m.id}
                type='button'
                onClick={() => setSelectedId(m.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                  selectedId === m.id && 'bg-accent font-medium'
                )}
              >
                <IconFileText className='size-4 shrink-0 text-muted-foreground' />
                <span className='truncate'>{m.title}</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <div className='min-h-0 min-w-0 flex-1'>
        {selected ? (
          <ManuscriptCanvas
            manuscript={selected}
            focused={focused}
            onToggleFocused={() => setFocused((v) => !v)}
          />
        ) : (
          <p className='text-sm text-muted-foreground'>{t('selectOrCreate')}</p>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newManuscript')}</DialogTitle>
          </DialogHeader>
          <Input
            value={title}
            placeholder={t('titlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Select value={collectionId} onValueChange={setCollectionId}>
            <SelectTrigger>
              <SelectValue placeholder={t('pickCollection')} />
            </SelectTrigger>
            <SelectContent>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCreateOpen(false)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void create()} disabled={busy || !title.trim() || !collectionId}>
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
