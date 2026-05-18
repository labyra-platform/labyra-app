'use client';
import {
  collection,
  type DocumentSnapshot,
  doc,
  onSnapshot,
  orderBy,
  query
} from 'firebase/firestore';
/**
 * Client-side Firestore queries for experiments.
 * @phase R160-data-1
 */
import { useEffect, useState } from 'react';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { Experiment } from '@/types/experiments';

function experimentFromSnapshot(snap: DocumentSnapshot): Experiment | null {
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id } as Experiment;
}

export function useExperiments() {
  const tenantId = useTenantId();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = query(
      collection(db(), `tenants/${tenantId}/experiments`),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setExperiments(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Experiment));
        setLoading(false);
      },
      (err) => {
        console.error('useExperiments listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return { experiments, loading };
}

export function useExperiment(experimentId: string | null) {
  const tenantId = useTenantId();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !experimentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/experiments/${experimentId}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setExperiment(experimentFromSnapshot(snap));
        setLoading(false);
      },
      (err) => {
        console.error('useExperiment listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, experimentId]);

  return { experiment, loading };
}
