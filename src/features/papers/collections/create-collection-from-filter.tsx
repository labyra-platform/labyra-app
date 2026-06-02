'use client';

/**
 * "New collection from the current filter" — a STATIC snapshot. Creates an
 * ordinary collection whose members are exactly the papers currently filtered,
 * frozen at creation: future papers that would match the same filter are NOT
 * added automatically. Static by design — the result is a normal collection
 * (drag-drop, rename, RAG source, delete all work), and a frozen membership
 * keeps a manuscript's curated source reproducible.
 *
 * @phase R-collection-5
 * @see labyra-collection-download-strategy.md §3
 */
import { IconFolderPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { siblingNameExists } from '@/features/papers/collections/collection-tree';
import { useCollections } from '@/features/papers/collections/use-collections';
import type { PaperFilterValue } from '@/features/papers/components/paper-filter-panel';
import { useTenantId } from '@/lib/auth';
import { addPapersToCollection, createCollection } from '@/lib/firestore/queries/collections';

/** A short default collection name derived from the active filter (editable). */
function suggestNameFromFilter(filter: PaperFilterValue): string {
  const parts: string[] = [];
  const q = filter.titleQuery.trim();
  if (q) parts.push(q);

  const journals = [...filter.journals];
  if (journals.length === 1) parts.push(journals[0]);
  else if (journals.length === 2) parts.push(journals.join(', '));
  else if (journals.length > 2) parts.push(`${journals[0]} +${journals.length - 1}`);

  const domains = [...filter.domain.selected, ...filter.openalexSubfields];
  if (domains.length === 1) parts.push(domains[0]);
  else if (domains.length > 1) parts.push(`${domains[0]} +${domains.length - 1}`);

  if (filter.yearMin !== null && filter.yearMax !== null) {
    parts.push(
      filter.yearMin === filter.yearMax
        ? String(filter.yearMin)
        : `${filter.yearMin}–${filter.yearMax}`
    );
  } else if (filter.yearMin !== null) {
    parts.push(`${filter.yearMin}+`);
  } else if (filter.yearMax !== null) {
    parts.push(`–${filter.yearMax}`);
  }

  return parts.join(' · ').slice(0, 60);
}

export function CreateCollectionFromFilter({
  paperIds,
  filter
}: {
  paperIds: string[];
  filter: PaperFilterValue;
}) {
  const t = useTranslations('collections');
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const { collections } = useCollections();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (paperIds.length === 0) return null;

  function openDialog() {
    setName(suggestNameFromFilter(filter));
    setOpen(true);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!tenantId || !trimmed) return;
    if (siblingNameExists(collections, null, trimmed)) {
      toast.error(t('duplicateName'));
      return;
    }
    setBusy(true);
    try {
      const id = await createCollection(tenantId, { name: trimmed });
      await addPapersToCollection(tenantId, id, paperIds);
      await queryClient.invalidateQueries({
        queryKey: ['tenant-collection', tenantId, 'collections']
      });
      toast.success(t('createdFromFilter', { count: paperIds.length, name: trimmed }));
      setOpen(false);
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type='button'
        onClick={openDialog}
        className='inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/50'
      >
        <IconFolderPlus className='size-3.5' />
        {t('createFromFilter', { count: paperIds.length })}
      </button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createFromFilterTitle')}</DialogTitle>
            <DialogDescription>
              {t('createFromFilterDesc', { count: paperIds.length })}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            placeholder={t('namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void submit()} disabled={busy || !name.trim()}>
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
