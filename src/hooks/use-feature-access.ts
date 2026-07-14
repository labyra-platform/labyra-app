'use client';

/**
 * useFeatureAccess — the tenant's disabled feature keys (R487).
 *
 * Module-level promise cache: the sidebar, kbar, and the route guard all call
 * this, but the tenant doc is fetched once per page load. Call
 * refreshFeatureAccess() after an admin save to invalidate.
 */
import { useEffect, useMemo, useState } from 'react';

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

let lastFetchAt = 0;

export function refreshFeatureAccess(): void {
  lastFetchAt = Date.now();
  cache = fetchDisabled();
  void cache.then((disabled) => {
    for (const fn of subscribers) fn(disabled);
  });
}

export function useFeatureAccess(): { disabled: Set<string>; loaded: boolean } {
  const [disabled, setDisabled] = useState<string[] | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!cache) {
      lastFetchAt = Date.now();
      cache = fetchDisabled();
    }
    void cache.then((d) => {
      if (mounted) setDisabled(d);
    });
    const sub = (d: string[]) => setDisabled(d);
    subscribers.add(sub);
    // R497: re-pull when the tab regains focus, so a member sees an admin's
    // gating change on their next glance without a manual hard reload.
    const onFocus = () => {
      if (Date.now() - lastFetchAt > 30_000) refreshFeatureAccess();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      mounted = false;
      subscribers.delete(sub);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const disabledSet = useMemo(() => new Set(disabled ?? []), [disabled]);
  return { disabled: disabledSet, loaded: disabled !== null };
}
