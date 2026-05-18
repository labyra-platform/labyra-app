/**
 * Fetch version history for a paper or reference.
 *
 * @phase R164-phase-8-9a
 */
'use client';
import { getAuth } from 'firebase/auth';
import { useEffect, useState } from 'react';

export interface VersionRecord {
  id: string;
  version: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- content shape varies per entity
  content: any;
  changedBy: string;
  changedAt: number;
  changeNote?: string;
}

export function useVersionHistory(
  entity: 'papers' | 'references',
  id: string
): { versions: VersionRecord[]; loading: boolean; error: string | null } {
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const user = getAuth().currentUser;
        if (!user) throw new Error('not_authenticated');
        const token = await user.getIdToken();
        const res = await fetch(`/api/${entity}/${id}/versions`, {
          headers: { authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { versions: VersionRecord[] };
        if (!cancelled) setVersions(data.versions);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'fetch_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, id]);

  return { versions, loading, error };
}
