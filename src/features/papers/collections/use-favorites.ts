'use client';

/**
 * Per-user favorite papers. A single doc at tenants/{tid}/favorites/{uid} holds
 * a `paperIds` array; this hook live-subscribes to it and toggles membership
 * with arrayUnion/arrayRemove (optimistic, corrected by the snapshot).
 */
import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth/use-auth';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore } from '@/lib/firebase/client';

export function useFavorites(): {
  favoriteIds: Set<string>;
  isFavorite: (paperId: string) => boolean;
  toggle: (paperId: string) => void;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const tenantId = useTenantId();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!uid || !tenantId) {
      setFavoriteIds(new Set());
      setIsLoading(false);
      return;
    }
    const db = getFirebaseFirestore();
    const ref = doc(db, `tenants/${tenantId}/favorites/${uid}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const ids = (snap.data()?.paperIds as string[] | undefined) ?? [];
        setFavoriteIds(new Set(ids));
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );
    return unsub;
  }, [uid, tenantId]);

  const toggle = useCallback(
    (paperId: string) => {
      if (!uid || !tenantId) return;
      const db = getFirebaseFirestore();
      const ref = doc(db, `tenants/${tenantId}/favorites/${uid}`);
      const isFav = favoriteIds.has(paperId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(paperId);
        else next.add(paperId);
        return next;
      });
      void setDoc(
        ref,
        { paperIds: isFav ? arrayRemove(paperId) : arrayUnion(paperId) },
        { merge: true }
      ).catch(() => {
        // The live snapshot re-syncs on failure, so no manual revert needed.
      });
    },
    [uid, tenantId, favoriteIds]
  );

  return {
    favoriteIds,
    isFavorite: (paperId) => favoriteIds.has(paperId),
    toggle,
    isLoading
  };
}
