'use client';

/**
 * Manuscripts page shell — master/detail. Left: the manuscript list + a "New
 * manuscript" dialog (title + the curated collection that scopes its RAG).
 * Right: the editor for the selected manuscript. A manuscript REQUIRES a
 * collection (its grounded source), so creation is disabled until one exists.
 *
 * @phase R-aiscience-4
 */
import {
  IconDotsVertical,
  IconFileText,
  IconFolder,
  IconPencil,
  IconPlus,
  IconTrash
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ManuscriptCanvas } from '@/features/manuscript/components/manuscript-canvas';
import type { Manuscript } from '@/features/manuscript/types';
import { useManuscripts } from '@/features/manuscript/use-manuscripts';
import { useCollections } from '@/features/papers/collections/use-collections';
import { useTenantId } from '@/lib/auth';
import {
  createManuscript,
  deleteManuscript,
  updateManuscriptMeta
} from '@/lib/firestore/queries/manuscripts';
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<Manuscript | null>(null);
  const [moveCollectionId, setMoveCollectionId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Manuscript | null>(null);
  const [rowBusy, setRowBusy] = useState(false);

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

  const paperCount = (cid: string) => collections.find((c) => c.id === cid)?.paperIds.length ?? 0;

  async function refreshList() {
    await queryClient.invalidateQueries({
      queryKey: ['tenant-collection', tenantId, 'manuscripts']
    });
  }

  async function submitManuscriptRename(id: string, rawName: string) {
    setRenamingId(null);
    const name = rawName.trim();
    const current = manuscripts.find((mm) => mm.id === id);
    if (!tenantId || !current || !name || name === current.title) return;
    try {
      await updateManuscriptMeta(tenantId, id, { title: name });
      await refreshList();
    } catch {
      toast.error(t('saveFailed'));
    }
  }

  async function doMove() {
    if (!tenantId || !moveTarget || !moveCollectionId) return;
    setRowBusy(true);
    try {
      await updateManuscriptMeta(tenantId, moveTarget.id, { collectionId: moveCollectionId });
      await refreshList();
      setMoveTarget(null);
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setRowBusy(false);
    }
  }

  async function doDelete() {
    if (!tenantId || !deleteTarget) return;
    setRowBusy(true);
    try {
      await deleteManuscript(tenantId, deleteTarget.id);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      await refreshList();
      setDeleteTarget(null);
    } catch {
      toast.error(t('deleteFailed'));
    } finally {
      setRowBusy(false);
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
              <ManuscriptRow
                key={m.id}
                m={m}
                paperCount={paperCount(m.collectionId)}
                selected={selectedId === m.id}
                onSelect={() => setSelectedId(m.id)}
                onRename={() => setRenamingId(m.id)}
                renaming={renamingId === m.id}
                onRenameCommit={(name) => void submitManuscriptRename(m.id, name)}
                onRenameCancel={() => setRenamingId(null)}
                onChangeCollection={() => {
                  setMoveCollectionId(m.collectionId);
                  setMoveTarget(m);
                }}
                onDelete={() => setDeleteTarget(m)}
              />
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
            onSelectManuscript={setSelectedId}
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

      <Dialog open={!!moveTarget} onOpenChange={(o) => !o && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('changeCollection')}</DialogTitle>
          </DialogHeader>
          <Select value={moveCollectionId} onValueChange={setMoveCollectionId}>
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
            <Button variant='outline' onClick={() => setMoveTarget(null)} disabled={rowBusy}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void doMove()} disabled={rowBusy || !moveCollectionId}>
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteConfirm', { title: deleteTarget?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rowBusy}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doDelete();
              }}
              disabled={rowBusy}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ManuscriptRow({
  m,
  paperCount,
  selected,
  onSelect,
  onRename,
  renaming,
  onRenameCommit,
  onRenameCancel,
  onChangeCollection,
  onDelete
}: {
  m: Manuscript;
  paperCount: number;
  selected: boolean;
  onSelect: () => void;
  onRename: () => void;
  renaming: boolean;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
  onChangeCollection: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('manuscript');
  const cancelledRef = useRef(false);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'group flex w-full items-center gap-1 rounded-md pr-1 pl-2 text-sm hover:bg-accent',
            selected && 'bg-accent font-medium'
          )}
        >
          {renaming ? (
            <div className='flex min-w-0 flex-1 items-center gap-1.5 py-1.5'>
              <IconFileText className='size-4 shrink-0 text-muted-foreground' />
              <input
                ref={(el) => {
                  if (el) {
                    el.focus();
                    el.select();
                  }
                }}
                defaultValue={m.title}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelledRef.current = true;
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => {
                  if (cancelledRef.current) {
                    cancelledRef.current = false;
                    onRenameCancel();
                    return;
                  }
                  onRenameCommit(e.currentTarget.value);
                }}
                aria-label={t('rename')}
                className='min-w-0 flex-1 rounded-sm border bg-background px-1 py-0.5 text-sm outline-none ring-1 ring-primary/50'
              />
            </div>
          ) : (
            <button
              type='button'
              onClick={onSelect}
              className='flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left'
            >
              <IconFileText className='size-4 shrink-0 text-muted-foreground' />
              <span className='truncate'>{m.title}</span>
            </button>
          )}
          <Badge
            variant='secondary'
            className='shrink-0'
            title={t('papersInCollection', { count: paperCount })}
          >
            {paperCount}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                aria-label={t('rename')}
                className='hover:bg-background shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100'
              >
                <IconDotsVertical className='size-4' />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={onRename}>
                <IconPencil className='size-4' />
                {t('rename')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onChangeCollection}>
                <IconFolder className='size-4' />
                {t('changeCollection')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className='text-destructive focus:text-destructive'
              >
                <IconTrash className='size-4' />
                {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRename}>
          <IconPencil className='size-4' />
          {t('rename')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onChangeCollection}>
          <IconFolder className='size-4' />
          {t('changeCollection')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className='text-destructive focus:text-destructive'>
          <IconTrash className='size-4' />
          {t('delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
