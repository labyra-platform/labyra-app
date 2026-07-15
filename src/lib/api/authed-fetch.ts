/**
 * fetch() with the caller's Firebase ID token attached.
 *
 * R523: lifted out of ai-preferences-form, which had it as a local helper. It
 * was fine as one copy; a second copy is how two call sites start disagreeing
 * about whether the token is refreshed or how content-type is set, and the
 * disagreement only shows up as a 401 nobody can reproduce.
 *
 * getIdToken() returns the cached token and refreshes it only when it is close
 * to expiring, so calling this per request is correct and cheap.
 */
import { getFirebaseAuth } from '@/lib/firebase/client';

export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers
    }
  });
}
