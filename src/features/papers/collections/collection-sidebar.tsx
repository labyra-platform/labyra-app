'use client';

/**
 * Per-user collection sidebar (Zotero-style). Renders fixed "All papers" /
 * "Unfiled" rows, then the nested collection tree, with create / rename /
 * delete / move-to-root wired to the R278 CRUD service and a TanStack refetch.
 *
 * Controlled: the parent owns `selection` + `onSelect` so the papers view can
 * react (wired in slice 3b). This component does not yet filter the list.
 *
 * @phase R-collection-3
 */
import { IconFiles, IconFolderQuestion, IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CollectionItem } from '@/features/papers/collections/collection-item';
import {
  type CollectionSelection,
  useCollections
} from '@/features/papers/collections/use-collections';
import {
  createCollection,
  deleteCollection,
  moveCollection,
  updateCollectionMeta
} from '@/lib/firestore/queries/collections';
import { useTenantId } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface CollectionSidebarProps {
  selection: CollectionSelection;
  onSelect: (selection: CollectionSelection) => void;
}

type EditState = { mode: 'create' | 'rename'; id?: string; parentId?: string | null; name: string };

export function CollectionSidebar({ selection, onSelect }: CollectionSidebarProps) {
  const t = useTranslations('collections');
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const { tree, isLoading } = useCollections();

  const [edit, setEdit] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    return queryClient.invalidateQueries({
      queryKey: ['tenant-collection', tenantId, 'collections']
    });
  }

  async function submitEdit() {
    const name = edit?.name.trim();
    if (!edit || !tenantId || !name) return;
    setBusy(true);
    try {
      if (edit.mode === 'create') {
        await createCollection(tenantId, { name, parentId: edit.parentId ?? null });
      } else if (edit.id) {
        await updateCollectionMeta(tenantId, edit.id, { name });
      }
      await refresh();
      setEdit(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !tenantId) return;
    setBusy(true);
    try {
      await deleteCollection(tenantId, deleteTarget.id);
      if (selection.kind === 'collection' && selection.collectionId === deleteTarget.id) {
        onSelect({ kind: 'all' });
      }
      await refresh();
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveToRoot(id: string) {
    if (!tenantId) return;
    try {
      await moveCollection(tenantId, id, null);
      await refresh();
    } catch {
      // validation/permission errors surface in console; toast UX is a later polish
    }
  }

  return (
    <div className='flex h-full flex-col'>
      <div className='flex items-center justify-between px-2 py-1.5'>
        <span className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
          {t('title')}
        </span>
        <Button
          variant='ghost'
          size='icon'
          className='size-6'
          aria-label={t('newCollection')}
          onClick={() => setEdit({ mode: 'create', parentId: null, name: '' })}
        >
          <IconPlus size={15} />
        </Button>
      </div>

      <ScrollArea className='min-h-0 flex-1 px-1'>
        <button
          type='button'
          onClick={() => onSelect({ kind: 'all' })}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent',
            selection.kind === 'all' && 'bg-accent font-medium'
          )}
        >
          <IconFiles size={15} className='text-muted-foreground' />
          {t('allPapers')}
        </button>
        <button
          type='button'
          onClick={() => onSelect({ kind: 'unfiled' })}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent',
            selection.kind === 'unfiled' && 'bg-accent font-medium'
          )}
        >
          <IconFolderQuestion size={15} className='text-muted-foreground' />
          {t('unfiled')}
        </button>

        <div className='mt-1 space-y-px'>
          {isLoading ? (
            <p className='px-2 py-2 text-xs text-muted-foreground'>{t('loading')}</p>
          ) : tree.length === 0 ? (
            <p className='px-2 py-2 text-xs text-muted-foreground'>{t('empty')}</p>
          ) : (
            tree.map((node) => (
              <CollectionItem
                key={node.collection.id}
                node={node}
                depth={0}
                selection={selection}
                onSelect={onSelect}
                onCreateChild={(parentId) => setEdit({ mode: 'create', parentId, name: '' })}
                onRename={(id, currentName) => setEdit({ mode: 'rename', id, name: currentName })}
                onDelete={(id, name) => setDeleteTarget({ id, name })}
                onMoveToRoot={handleMoveToRoot}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit?.mode === 'rename' ? t('renameTitle') : t('createTitle')}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={edit?.name ?? ''}
            placeholder={t('namePlaceholder')}
            onChange={(e) => setEdit((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitEdit();
            }}
          />
          <DialogFooter>
            <Button variant='outline' onClick={() => setEdit(null)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void submitEdit()} disabled={busy || !edit?.name.trim()}>
              {edit?.mode === 'rename' ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} disabled={busy}>
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
