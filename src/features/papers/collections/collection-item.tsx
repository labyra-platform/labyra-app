'use client';

/**
 * One node in the collection tree. Recursive: renders its own row (folder icon,
 * name, paper-count badge, actions) then its children inside a Collapsible.
 *
 * Actions are HYBRID — the same set is reachable via a kebab (vertical dots)
 * and via right-click (context menu). The row is also a drop target: dragging a
 * paper from the list onto it adds the paper to this collection (Zotero-style).
 *
 * @phase R-collection-4 (UI polish + DnD + context menu)
 */
import {
  IconArrowBackUp,
  IconChevronRight,
  IconDotsVertical,
  IconFolder,
  IconFolderOpen,
  IconPencil,
  IconPlus,
  IconTrash
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import type { CollectionNode } from '@/features/papers/collections/collection-tree';
import {
  type CollectionSelection,
  PAPER_DND_MIME
} from '@/features/papers/collections/use-collections';
import { cn } from '@/lib/utils';

export interface CollectionItemProps {
  node: CollectionNode;
  depth: number;
  selection: CollectionSelection;
  onSelect: (selection: CollectionSelection) => void;
  onCreateChild: (parentId: string) => void;
  onRename: (id: string, currentName: string) => void;
  /** R317 inline rename: which collection is being renamed in-place, + commit/cancel. */
  renamingId: string | null;
  onRenameCommit: (id: string, name: string) => void;
  onRenameCancel: () => void;
  onDelete: (id: string, name: string) => void;
  onMoveToRoot: (id: string) => void;
  /** Drop a dragged paper into this collection. */
  onDropPaper: (collectionId: string, paperId: string) => void;
}

export function CollectionItem({
  node,
  depth,
  selection,
  onSelect,
  onCreateChild,
  onRename,
  renamingId,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onMoveToRoot,
  onDropPaper
}: CollectionItemProps) {
  const t = useTranslations('collections');
  const [open, setOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const cancelledRef = useRef(false);
  const { collection, children } = node;
  const hasChildren = children.length > 0;
  const isSelected = selection.kind === 'collection' && selection.collectionId === collection.id;
  const isNested = collection.parentId != null;
  const isRenaming = renamingId === collection.id;

  const icon = collection.color ? (
    <span className='size-3 shrink-0 rounded-full' style={{ backgroundColor: collection.color }} />
  ) : open && hasChildren ? (
    <IconFolderOpen size={15} className='shrink-0 text-muted-foreground' />
  ) : (
    <IconFolder size={15} className='shrink-0 text-muted-foreground' />
  );

  // The action set, rendered identically in the kebab menu and the right-click
  // context menu. Each renderer wraps these in its own item component.
  const actions = (
    Item: typeof DropdownMenuItem | typeof ContextMenuItem,
    Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator
  ) => (
    <>
      <Item onClick={() => onCreateChild(collection.id)}>
        <IconPlus size={14} />
        {t('newSubcollection')}
      </Item>
      <Item onClick={() => onRename(collection.id, collection.name)}>
        <IconPencil size={14} />
        {t('rename')}
      </Item>
      {isNested && (
        <Item onClick={() => onMoveToRoot(collection.id)}>
          <IconArrowBackUp size={14} />
          {t('moveToRoot')}
        </Item>
      )}
      <Separator />
      <Item variant='destructive' onClick={() => onDelete(collection.id, collection.name)}>
        <IconTrash size={14} />
        {t('delete')}
      </Item>
    </>
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              'group flex items-center gap-1 rounded-md pr-1 text-sm hover:bg-accent',
              isSelected && 'bg-accent font-medium',
              isDragOver && 'bg-primary/10 ring-1 ring-primary'
            )}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(PAPER_DND_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (!isDragOver) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              const paperId = e.dataTransfer.getData(PAPER_DND_MIME);
              setIsDragOver(false);
              if (!paperId) return;
              e.preventDefault();
              onDropPaper(collection.id, paperId);
            }}
          >
            {hasChildren ? (
              <CollapsibleTrigger asChild>
                <button
                  type='button'
                  className='flex size-4 shrink-0 items-center justify-center text-muted-foreground'
                  aria-label='toggle'
                >
                  <IconChevronRight
                    size={14}
                    className={cn('transition-transform', open && 'rotate-90')}
                  />
                </button>
              </CollapsibleTrigger>
            ) : (
              <span className='size-4 shrink-0' />
            )}

            {isRenaming ? (
              <div className='flex min-w-0 flex-1 items-center gap-1.5 py-1.5'>
                {icon}
                <input
                  ref={(el) => {
                    if (el) {
                      el.focus();
                      el.select();
                    }
                  }}
                  defaultValue={collection.name}
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
                    onRenameCommit(collection.id, e.currentTarget.value);
                  }}
                  aria-label={t('rename')}
                  className='min-w-0 flex-1 rounded-sm border bg-background px-1 py-0.5 text-sm outline-none ring-1 ring-primary/50'
                />
              </div>
            ) : (
              <button
                type='button'
                onClick={() => onSelect({ kind: 'collection', collectionId: collection.id })}
                className='flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left'
              >
                {icon}
                <span className='truncate'>{collection.name}</span>
              </button>
            )}

            {collection.paperIds.length > 0 && (
              <Badge variant='secondary' className='h-4 px-1 text-[10px] tabular-nums'>
                {collection.paperIds.length}
              </Badge>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-5 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100'
                  aria-label='actions'
                >
                  <IconDotsVertical size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='min-w-40'>
                {actions(DropdownMenuItem, DropdownMenuSeparator)}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className='min-w-40'>
          {actions(ContextMenuItem, ContextMenuSeparator)}
        </ContextMenuContent>
      </ContextMenu>

      {hasChildren && (
        <CollapsibleContent>
          {children.map((child) => (
            <CollectionItem
              key={child.collection.id}
              node={child}
              depth={depth + 1}
              selection={selection}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onRename={onRename}
              renamingId={renamingId}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onDelete={onDelete}
              onMoveToRoot={onMoveToRoot}
              onDropPaper={onDropPaper}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
