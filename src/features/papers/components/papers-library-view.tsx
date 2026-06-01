'use client';

/**
 * Papers library view — the list page shell. Owns the collection `selection`
 * state, renders the CollectionSidebar beside the PaperList, and derives the
 * paper-id filter the list applies. Lives client-side because the page route is
 * an RSC and cannot hold selection state.
 *
 * @phase R-collection-3b
 */
import { useMemo, useState } from 'react';
import { CollectionSidebar } from '@/features/papers/collections/collection-sidebar';
import {
  type CollectionPaperFilter,
  type CollectionSelection,
  useCollections
} from '@/features/papers/collections/use-collections';
import { PaperList } from '@/features/papers/components/paper-list';

export function PapersLibraryView() {
  const [selection, setSelection] = useState<CollectionSelection>({ kind: 'all' });
  const { collections } = useCollections();

  const collectionFilter = useMemo<CollectionPaperFilter | null>(() => {
    if (selection.kind === 'all') return null;
    if (selection.kind === 'unfiled') {
      const filed = new Set<string>();
      for (const c of collections) {
        for (const id of c.paperIds) filed.add(id);
      }
      return { kind: 'exclude', ids: filed };
    }
    const selected = collections.find((c) => c.id === selection.collectionId);
    return { kind: 'include', ids: new Set(selected?.paperIds ?? []) };
  }, [selection, collections]);

  return (
    <div className='flex gap-4'>
      <aside className='hidden w-56 shrink-0 md:block'>
        <div className='sticky top-4 h-[calc(100vh-9rem)]'>
          <CollectionSidebar selection={selection} onSelect={setSelection} />
        </div>
      </aside>
      <div className='min-w-0 flex-1'>
        <PaperList collectionFilter={collectionFilter} />
      </div>
    </div>
  );
}
