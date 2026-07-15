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
    <div className='flex gap-4'>
      <aside className='hidden w-56 shrink-0 md:block'>
        {/* R526: sticks below the header, not 16px inside it. The header is
            sticky top-0 z-20 and 56px tall; top-4 pinned this at 16px with no
            z-index of its own, so it slid underneath — which is what the tab
            bar screenshot shows. Both numbers now come from --app-header-h, so
            they cannot drift apart. */}
        <div className='sticky top-[var(--app-header-h)] h-[calc(100vh-var(--app-header-h)-2rem)]'>
          <CollectionSidebar selection={selection} onSelect={setSelection} />
        </div>
      </aside>
      <div className='min-w-0 flex-1'>
        <PaperList collectionFilter={collectionFilter} headerAction={action} />
      </div>
    </div>
  );
}
