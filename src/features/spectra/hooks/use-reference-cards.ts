/**
 * useReferenceCards — fetch + cache tenant reference cards, manage active overlays.
 *
 * Active state stored in localStorage per-spectrum (UX).
 * Card colors auto-assigned cyclically.
 *
 * @phase R160-spectra-4a-pdf
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { ReferenceCard } from '@/types/spectra';

const ACTIVE_KEY = 'labyra:active-reference-cards';

const OVERLAY_COLORS = [
  'hsl(165, 70%, 45%)',
  'hsl(280, 60%, 55%)',
  'hsl(30, 80%, 50%)',
  'hsl(190, 70%, 45%)',
  'hsl(340, 65%, 55%)'
];

export interface ActiveReferenceCard extends ReferenceCard {
  color: string;
}

function loadActiveIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveActiveIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(ids));
}

export function useReferenceCards() {
  const [allCards, setAllCards] = useState<ReferenceCard[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>(() => loadActiveIds());
  const [loading, setLoading] = useState(false);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch('/api/reference-cards', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const { cards } = (await res.json()) as { cards: ReferenceCard[] };
      setAllCards(cards);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCards();
  }, [fetchCards]);

  const toggleCard = useCallback((id: string) => {
    setActiveIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveActiveIds(next);
      return next;
    });
  }, []);

  const activeCards: ActiveReferenceCard[] = activeIds
    .map((id) => allCards.find((c) => c.id === id))
    .filter((c): c is ReferenceCard => c !== undefined)
    .map((c, i) => ({ ...c, color: OVERLAY_COLORS[i % OVERLAY_COLORS.length] }));

  return {
    allCards,
    activeCards,
    activeIds,
    loading,
    toggleCard,
    refresh: fetchCards
  };
}
