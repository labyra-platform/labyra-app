'use client';

/**
 * Client-side Firestore queries for papers.
 * Uses TanStack Query with Firestore realtime listeners.
 * @phase R160-ai-5b-1
 */
import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type DocumentSnapshot
} from 'firebase/firestore';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { Paper, MonthlyUsage } from '@/types/papers';

function paperFromSnapshot(snap: DocumentSnapshot): Paper | null {
  if (!snap.exists()) return null;
  return snap.data() as Paper;
}

/** Realtime listener for all papers in current tenant, sorted by uploadedAt desc. */
export function usePapers() {
  const tenantId = useTenantId();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = query(collection(db(), `tenants/${tenantId}/papers`), orderBy('uploadedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPapers(snap.docs.map((d) => d.data() as Paper));
        setLoading(false);
      },
      (err) => {
        console.error('usePapers listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return { papers, loading };
}

/** Realtime listener for a single paper. */
export function usePaper(paperId: string | null) {
  const tenantId = useTenantId();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !paperId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/papers/${paperId}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setPaper(paperFromSnapshot(snap));
        setLoading(false);
      },
      (err) => {
        console.error('usePaper listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, paperId]);

  return { paper, loading };
}

/** Current-month usage for tenant. */
export function useMonthlyUsage() {
  const tenantId = useTenantId();
  const [usage, setUsage] = useState<MonthlyUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    const yearMonth = (() => {
      const d = new Date();
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/usage/${yearMonth}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setUsage(snap.exists() ? (snap.data() as MonthlyUsage) : null);
        setLoading(false);
      },
      (err) => {
        console.error('useMonthlyUsage listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return { usage, loading };
}
