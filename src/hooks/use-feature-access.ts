'use client';

/**
 * useFeatureAccess — the tenant's disabled feature keys (R487).
 *
 * Module-level promise cache: the sidebar, kbar, and the route guard all call
 * this, but the tenant doc is fetched once per page load. Call
 * refreshFeatureAccess() after an admin save to invalidate.
 */
import { useEffect, useState } from 'react';

let cache: Promise<string[]> | null = null;
const subscribers = new Set<(disabled: string[]) => void>();

async function fetchDisabled(): Promise<string[]> {
  try {
    const { getFirebaseAuth } = await import('@/lib/firebase/client');
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) return [];
    const res = await fetch('/api/tenant/feature-access', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { disabled?: string[] };
    return data.disabled ?? [];
  } catch {
    return [];
  }
}

export function refreshFeatureAccess(): void {
  cache = fetchDisabled();
  void cache.then((disabled) => {
    for (const fn of subscribers) fn(disabled);
  });
}

export function useFeatureAccess(): { disabled: Set<string>; loaded: boolean } {
  const [disabled, setDisabled] = useState<string[] | null>(null);

  useEffect(() => {
    let mounted = true;
    cache ??= fetchDisabled();
    void cache.then((d) => {
      if (mounted) setDisabled(d);
    });
    const sub = (d: string[]) => setDisabled(d);
    subscribers.add(sub);
    return () => {
      mounted = false;
      subscribers.delete(sub);
    };
  }, []);

  return { disabled: new Set(disabled ?? []), loaded: disabled !== null };
}
