'use client';
/**
 * Client Firestore queries for chemicals (live onSnapshot).
 * @phase CHEM-1
 */
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { Chemical } from '@/types/chemical';

export function useChemicalsList() {
  const tenantId = useTenantId();
  const [chemicals, setChemicals] = useState<Chemical[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = query(
      collection(db(), `tenants/${tenantId}/chemicals`),
      orderBy('updatedAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setChemicals(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }) as Chemical)
            .filter((c) => c.lifecycleStatus !== 'retracted' && c.lifecycleStatus !== 'deprecated')
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [tenantId]);

  return { chemicals, loading };
}
