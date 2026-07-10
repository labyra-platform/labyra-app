'use client';

/**
 * Live-list the tenant's saved DFT step presets, newest first.
 *
 * @phase R280 — step presets
 */
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import type { DftStepPreset } from '@/features/computation/dft-preset';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore } from '@/lib/firebase/client';

export function useDftStepPresets(): { presets: DftStepPreset[]; loading: boolean } {
  const tenantId = useTenantId();
  const [presets, setPresets] = useState<DftStepPreset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setPresets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(getFirebaseFirestore(), `tenants/${tenantId}/dftStepPresets`),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPresets(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as DftStepPreset));
        setLoading(false);
      },
      (err) => {
        console.error('useDftStepPresets listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return { presets, loading };
}
