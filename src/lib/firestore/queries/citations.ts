'use client';
/**
 * Client-side Firestore realtime queries for citations.
 * Mirrors papers.ts pattern: useTenantId + onSnapshot.
 *
 * @phase R166-6b-1
 */
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { Citation, PaperCitationStats } from '@/types/citations';

/** Realtime: all active citations FROM a paper (outbound — what this paper cites). */
export function useCitationsBySource(paperId: string | null) {
  const tenantId = useTenantId();
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !paperId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db(), `tenants/${tenantId}/citations`),
      where('sourcePaperId', '==', paperId),
      where('lifecycleStatus', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCitations(snap.docs.map((d) => d.data() as Citation));
        setLoading(false);
      },
      (err) => {
        // eslint-disable-next-line no-console -- listener error surface
        console.error('useCitationsBySource listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, paperId]);

  return { citations, loading };
}

/** Realtime: all active citations TO a paper (inbound — who cites this paper). */
export function useCitationsByTargetPaperId(paperId: string | null) {
  const tenantId = useTenantId();
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !paperId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db(), `tenants/${tenantId}/citations`),
      where('targetPaperId', '==', paperId),
      where('lifecycleStatus', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCitations(snap.docs.map((d) => d.data() as Citation));
        setLoading(false);
      },
      (err) => {
        // eslint-disable-next-line no-console -- listener error surface
        console.error('useCitationsByTargetPaperId listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, paperId]);

  return { citations, loading };
}

/** Realtime: denormalized stats for a paper (citationsOutCount, citationsInCount). */
export function usePaperCitationStats(paperId: string | null) {
  const tenantId = useTenantId();
  const [stats, setStats] = useState<PaperCitationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !paperId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/papers/${paperId}/_stats/citations`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setStats(snap.exists() ? (snap.data() as PaperCitationStats) : null);
        setLoading(false);
      },
      (err) => {
        // eslint-disable-next-line no-console -- listener error surface
        console.error('usePaperCitationStats listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, paperId]);

  return { stats, loading };
}
