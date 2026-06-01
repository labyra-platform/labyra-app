'use client';

/**
 * One node in the collection tree. Recursive: renders its own row (folder icon,
 * name, paper-count badge, actions menu) then its children inside a Collapsible.
 *
 * @phase R-collection-3
 */
import {
  IconArrowBackUp,
  IconChevronRight,
  IconDots,
  IconFolder,
  IconFolderOpen,
  IconPencil,
  IconPlus,
  IconTrash
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import type { CollectionNode } from '@/features/papers/collections/collection-tree';
import type { CollectionSelection } from '@/features/papers/collections/use-collections';
import { cn } from '@/lib/utils';

export interface CollectionItemProps {
  node: CollectionNode;
  depth: number;
  selection: CollectionSelection;
  onSelect: (selection: CollectionSelection) => void;
  onCreateChild: (parentId: string) => void;
  onRename: (id: string, currentName: string) => void;
  onDelete: (id: string, name: string) => void;
  onMoveToRoot: (id: string) => void;
}

export function CollectionItem({
  node,
  depth,
  selection,
  onSelect,
  onCreateChild,
  onRename,
  onDelete,
  onMoveToRoot
}: CollectionItemProps) {
  const t = useTranslations('collections');
  const [open, setOpen] = useState(false);
  const { collection, children } = node;
  const hasChildren = children.length > 0;
  const isSelected = selection.kind === 'collection' && selection.collectionId === collection.id;
  const isNested = collection.parentId != null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md pr-1 text-sm hover:bg-accent',
          isSelected && 'bg-accent font-medium'
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
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

        <button
          type='button'
          onClick={() => onSelect({ kind: 'collection', collectionId: collection.id })}
          className='flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left'
        >
          {collection.color ? (
            <span
              className='size-3 shrink-0 rounded-full'
              style={{ backgroundColor: collection.color }}
            />
          ) : open && hasChildren ? (
            <IconFolderOpen size={15} className='shrink-0 text-muted-foreground' />
          ) : (
            <IconFolder size={15} className='shrink-0 text-muted-foreground' />
          )}
          <span className='truncate'>{collection.name}</span>
        </button>

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
              <IconDots size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => onCreateChild(collection.id)}>
              <IconPlus size={14} />
              {t('newSubcollection')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRename(collection.id, collection.name)}>
              <IconPencil size={14} />
              {t('rename')}
            </DropdownMenuItem>
            {isNested && (
              <DropdownMenuItem onClick={() => onMoveToRoot(collection.id)}>
                <IconArrowBackUp size={14} />
                {t('moveToRoot')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant='destructive'
              onClick={() => onDelete(collection.id, collection.name)}
            >
              <IconTrash size={14} />
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
              onDelete={onDelete}
              onMoveToRoot={onMoveToRoot}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
