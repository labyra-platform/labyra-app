'use client';

import type React from 'react';

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
import { useFavorites } from '@/features/papers/collections/use-favorites';
import { PaperList } from '@/features/papers/components/paper-list';

export function PapersLibraryView({ action }: { action?: React.ReactNode }) {
  const [selection, setSelection] = useState<CollectionSelection>({ kind: 'all' });
  const { collections } = useCollections();
  const { favoriteIds } = useFavorites();

  const collectionFilter = useMemo<CollectionPaperFilter | null>(() => {
    if (selection.kind === 'all') return null;
    if (selection.kind === 'favorites') {
      return { kind: 'include', ids: favoriteIds };
    }
    if (selection.kind === 'unfiled') {
      const filed = new Set<string>();
      for (const c of collections) {
        for (const id of c.paperIds) filed.add(id);
      }
      return { kind: 'exclude', ids: filed };
    }
    const selected = collections.find((c) => c.id === selection.collectionId);
    return { kind: 'include', ids: new Set(selected?.paperIds ?? []) };
  }, [selection, collections, favoriteIds]);

  return (
    <div className='flex min-h-0 flex-1 gap-4'>
      <aside className='hidden w-56 shrink-0 md:block'>
        {/* R536: no sticky, no 100vh arithmetic. The column is now inside a
            fixed-height row, so h-full *is* the viewport height minus whatever
            is above — measured by the layout instead of guessed by me. R526 and
            R527 were both attempts to guess that number; neither needed to
            exist. */}
        <div className='h-full'>
          <CollectionSidebar selection={selection} onSelect={setSelection} />
        </div>
      </aside>
      <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
        <PaperList collectionFilter={collectionFilter} headerAction={action} />
      </div>
    </div>
  );
}
