'use client';

/**
 * useFeatureAccess — the tenant's disabled feature keys (R487).
 *
 * Module-level promise cache: the sidebar, kbar, and the route guard all call
 * this, but the tenant doc is fetched once per page load. Call
 * refreshFeatureAccess() after an admin save to invalidate.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { useRole } from '@/lib/auth/use-claims';

let cache: Promise<string[] | null> | null = null;
const subscribers = new Set<(disabled: string[] | null) => void>();

/**
 * R569: null means "don't know yet". [] means "nothing is disabled".
 *
 * Every failure path used to return [], and an empty disabled-set grants
 * everything. Worse, `loaded` was `disabled !== null` — and [] is not null — so
 * the guard believed it had a verdict, and the verdict was "allow".
 *
 * That is the few-minutes-of-full-access in incognito. First paint, Firebase
 * has not restored the session, `currentUser` is null, `!token` returns [], and
 * `cache` is module-level so the empty answer sticks. Everything is visible.
 * Then the window-focus refresh fires after 30s, the token exists by now, the
 * real config lands and the features vanish. The app was not slow to gate — it
 * had gated on "no answer" and read that as "yes".
 *
 * A gate must fail closed: no answer is not permission.
 */
async function fetchDisabled(): Promise<string[] | null> {
  try {
    const { getFirebaseAuth } = await import('@/lib/firebase/client');
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    // Not signed in *yet* — a state we pass through on every cold load, not an
    // answer about what this user may see.
    if (!token) return null;
    const res = await fetch('/api/tenant/feature-access', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { disabled?: string[] };
    return data.disabled ?? [];
  } catch {
    return null;
  }
}

let lastFetchAt = 0;

export function refreshFeatureAccess(): void {
  lastFetchAt = Date.now();
  cache = fetchDisabled();
  void cache.then((disabled) => {
    if (disabled === null) cache = null;
    for (const fn of subscribers) fn(disabled);
  });
}

export function useFeatureAccess(): { disabled: Set<string>; loaded: boolean } {
  const [disabled, setDisabled] = useState<string[] | null>(null);
  // R569: the fetch needs a token, and the token arrives after first paint.
  // Depending on the user means the retry happens when the session is actually
  // ready — before, the only thing that re-asked was a window-focus listener
  // gated at 30 seconds, which is why the wrong answer stood for minutes.
  const { user } = useAuth();

  useEffect(() => {
    let mounted = true;
    if (!cache) {
      lastFetchAt = Date.now();
      cache = fetchDisabled();
    }
    void cache.then((d) => {
      // A null answer must not be cached: it means we asked too early, and the
      // next mount deserves a real attempt rather than the stale shrug.
      if (d === null) cache = null;
      if (mounted) setDisabled(d);
    });
    const sub = (d: string[] | null) => setDisabled(d);
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
  }, [user]);

  const disabledSet = useMemo(() => new Set(disabled ?? []), [disabled]);
  return { disabled: disabledSet, loaded: disabled !== null };
}

/**
 * R509: is this one feature available to the caller?
 *
 * For cards that aggregate across features. A blocked member must not be told
 * "0 chemicals" — that is still an answer about chemicals, and a wrong one.
 * Undefined while the verdict is in flight, so callers can withhold rather
 * than guess.
 */
export function useFeatureAllowed(key: string): boolean | undefined {
  const role = useRole();
  const { disabled, loaded } = useFeatureAccess();
  if (role === 'admin' || role === 'superadmin') return true;
  if (!loaded) return undefined;
  return !disabled.has(key);
}
