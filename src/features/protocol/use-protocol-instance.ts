'use client';

/**
 * Live-read an experiment's protocol instance (the single doc under the
 * experiment). Null when none is attached yet.
 *
 * @phase R271 — Protocol Instance (data layer)
 */
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { instancePath } from '@/lib/firestore/queries/protocol-instances';
import type { ProtocolInstance } from '@/types/protocol-instance';

export function useProtocolInstance(experimentId: string | null): {
  instance: ProtocolInstance | null;
  loading: boolean;
} {
  const tenantId = useTenantId();
  const [instance, setInstance] = useState<ProtocolInstance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !experimentId) {
      setInstance(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(getFirebaseFirestore(), instancePath(tenantId, experimentId));
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setInstance(snap.exists() ? ({ ...snap.data(), id: snap.id } as ProtocolInstance) : null);
        setLoading(false);
      },
      (err) => {
        console.error('useProtocolInstance listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, experimentId]);

  return { instance, loading };
}
