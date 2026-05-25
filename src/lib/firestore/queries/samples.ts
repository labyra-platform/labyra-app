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
 * Client-side Firestore queries for samples.
 * @phase R160-data-1
 */
import { useEffect, useState } from 'react';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { Sample } from '@/types/samples';

function sampleFromSnapshot(snap: DocumentSnapshot): Sample | null {
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id } as Sample;
}

export function useSamples() {
  const tenantId = useTenantId();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = query(collection(db(), `tenants/${tenantId}/samples`), orderBy('preparedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSamples(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }) as Sample)
            .filter((x) => x.lifecycleStatus !== 'deprecated' && x.lifecycleStatus !== 'retracted')
        );
        setLoading(false);
      },
      (err) => {
        console.error('useSamples listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return { samples, loading };
}

export function useSample(sampleId: string | null) {
  const tenantId = useTenantId();
  const [sample, setSample] = useState<Sample | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !sampleId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/samples/${sampleId}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSample(sampleFromSnapshot(snap));
        setLoading(false);
      },
      (err) => {
        console.error('useSample listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, sampleId]);

  return { sample, loading };
}
