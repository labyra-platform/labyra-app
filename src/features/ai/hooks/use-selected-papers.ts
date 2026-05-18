'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';

const MAX_SELECTED = 10;
const DEBOUNCE_MS = 500;

export interface UseSelectedPapersResult {
  selected: ReadonlySet<string>;
  toggle: (paperId: string) => void;
  clear: () => void;
  saving: boolean;
  error: string | null;
  maxReached: boolean;
}

export function useSelectedPapers(
  conversationId: string | null,
  initialIds: readonly string[] | undefined
): UseSelectedPapersResult {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastInitKey = useRef<string | null>(null);
  useEffect(() => {
    const key = conversationId ? `${conversationId}:${(initialIds ?? []).join(',')}` : null;
    if (key === lastInitKey.current) return;
    lastInitKey.current = key;
    setSelected(new Set(initialIds ?? []));
  }, [conversationId, initialIds]);

  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (cid: string, paperIds: string[]) => {
    setSaving(true);
    setError(null);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/conversations/${cid}/papers`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paperIds })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save_failed');
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback(
    (next: Set<string>) => {
      if (!conversationId) return;
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = setTimeout(() => {
        persist(conversationId, Array.from(next));
      }, DEBOUNCE_MS);
    },
    [conversationId, persist]
  );

  const toggle = useCallback(
    (paperId: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(paperId)) {
          next.delete(paperId);
        } else if (next.size < MAX_SELECTED) {
          next.add(paperId);
        } else {
          return prev;
        }
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const clear = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  useEffect(
    () => () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    },
    []
  );

  return {
    selected,
    toggle,
    clear,
    saving,
    error,
    maxReached: selected.size >= MAX_SELECTED
  };
}

export const PAPER_SELECT_MAX = MAX_SELECTED;
