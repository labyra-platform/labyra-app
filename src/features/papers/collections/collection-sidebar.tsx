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
import { IconDotsVertical, IconFiles, IconLibrary, IconPlus } from '@tabler/icons-react';
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
import { useAuth } from '@/lib/auth/use-auth';
import { siblingNameExists } from '@/features/papers/collections/collection-tree';
import {
  type CollectionSelection,
  useCollections
} from '@/features/papers/collections/use-collections';
import { ProjectSelect } from '@/features/projects/project-select';
import {
  addPapersToCollection,
  createCollection,
  deleteCollection,
  moveCollection,
  updateCollectionMeta
} from '@/lib/firestore/queries/collections';
import { useTenantId } from '@/lib/auth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CollectionSidebarProps {
  selection: CollectionSelection;
  onSelect: (selection: CollectionSelection) => void;
}

type EditState = {
  mode: 'create' | 'rename';
  id?: string;
  parentId?: string | null;
  name: string;
  /** R265d: project link, create mode only (rename leaves it untouched). */
  projectId?: string;
};

export function CollectionSidebar({ selection, onSelect }: CollectionSidebarProps) {
  const t = useTranslations('collections');
  const { user } = useAuth();
  const [exportingId, setExportingId] = useState<string | null>(null);

  const handleExport = async (id: string, name: string) => {
    if (!user || exportingId) return;
    setExportingId(id);
    const toastId = toast.loading(t('exporting'));
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/collections/${id}/export`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 422) {
        toast.error(t('exportEmpty'), { id: toastId });
        return;
      }
      if (!res.ok) {
        toast.error(t('exportFailed'), { id: toastId });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.dismiss(toastId);
    } catch {
      toast.error(t('exportFailed'), { id: toastId });
    } finally {
      setExportingId(null);
    }
  };
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const { collections, tree, isLoading } = useCollections();

  const [edit, setEdit] = useState<EditState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    return queryClient.invalidateQueries({
      queryKey: ['tenant-collection', tenantId, 'collections']
    });
  }

  // Inline rename (R317): edit the name in the row itself, not a modal.
  async function submitRename(id: string, rawName: string) {
    setRenamingId(null);
    const name = rawName.trim();
    const current = collections.find((c) => c.id === id);
    if (!tenantId || !current || !name || name === current.name) return;
    const parentId = current.parentId ?? null;
    if (siblingNameExists(collections, parentId, name, id)) {
      toast.error(t('duplicateName'));
      return;
    }
    try {
      await updateCollectionMeta(tenantId, id, { name });
      await refresh();
    } catch {
      toast.error(t('saveFailed'));
    }
  }

  async function submitEdit() {
    const name = edit?.name.trim();
    if (!edit || !tenantId || !name) return;
    const parentId =
      edit.mode === 'create'
        ? (edit.parentId ?? null)
        : (collections.find((c) => c.id === edit.id)?.parentId ?? null);
    if (
      siblingNameExists(collections, parentId, name, edit.mode === 'rename' ? edit.id : undefined)
    ) {
      toast.error(t('duplicateName'));
      return;
    }
    setBusy(true);
    try {
      if (edit.mode === 'create') {
        await createCollection(tenantId, { name, parentId, projectId: edit.projectId });
      } else if (edit.id) {
        await updateCollectionMeta(tenantId, edit.id, { name });
      }
      await refresh();
      setEdit(null);
    } catch {
      toast.error(t('saveFailed'));
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
    } catch {
      toast.error(t('deleteFailed'));
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
      toast.error(t('moveFailed'));
    }
  }

  async function handleDropPaper(collectionId: string, paperId: string) {
    if (!tenantId || !paperId) return;
    const target = collections.find((c) => c.id === collectionId);
    if (target?.paperIds.includes(paperId)) {
      toast.info(t('alreadyInCollection', { name: target.name }));
      return;
    }
    try {
      await addPapersToCollection(tenantId, collectionId, [paperId]);
      await refresh();
      toast.success(t('addedToast', { name: target?.name ?? '' }));
    } catch {
      toast.error(t('addFailed'));
    }
  }

  return (
    <div className='flex h-full flex-col pt-1'>
      <ScrollArea className='min-h-0 flex-1 px-1'>
        <button
          type='button'
          onClick={() => onSelect({ kind: 'all' })}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent',
            selection.kind === 'all' && 'bg-accent font-medium'
          )}
        >
          <IconFiles size={15} className='text-muted-foreground' />
          {t('allPapers')}
        </button>

        {/* My library (papers not in any collection) — also hosts "New
            collection" via kebab + right-click; the standalone header + button
            was removed for a tidier sidebar. */}
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                'group flex items-center gap-1 rounded-md pr-1 text-sm hover:bg-accent',
                selection.kind === 'unfiled' && 'bg-accent font-medium'
              )}
            >
              <button
                type='button'
                onClick={() => onSelect({ kind: 'unfiled' })}
                className='flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1.5 text-left'
              >
                <IconLibrary size={15} className='text-muted-foreground' />
                {t('myLibrary')}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-5 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100'
                    aria-label={t('newCollection')}
                  >
                    <IconDotsVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='min-w-40'>
                  <DropdownMenuItem
                    onClick={() => setEdit({ mode: 'create', parentId: null, name: '' })}
                  >
                    <IconPlus size={14} />
                    {t('newCollection')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className='min-w-40'>
            <ContextMenuItem onClick={() => setEdit({ mode: 'create', parentId: null, name: '' })}>
              <IconPlus size={14} />
              {t('newCollection')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

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
                onCreateChild={(parentId) =>
                  setEdit({
                    mode: 'create',
                    parentId,
                    name: '',
                    // R265d: default a sub-collection to its parent's project.
                    projectId: collections.find((c) => c.id === parentId)?.projectId
                  })
                }
                onRename={(id) => setRenamingId(id)}
                renamingId={renamingId}
                onRenameCommit={submitRename}
                onRenameCancel={() => setRenamingId(null)}
                onDelete={(id, name) => setDeleteTarget({ id, name })}
                onMoveToRoot={handleMoveToRoot}
                onDropPaper={handleDropPaper}
                onExport={handleExport}
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
          {edit?.mode === 'create' && (
            <ProjectSelect
              value={edit.projectId}
              onChange={(projectId) => setEdit((prev) => (prev ? { ...prev, projectId } : prev))}
              disabled={busy}
            />
          )}
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
