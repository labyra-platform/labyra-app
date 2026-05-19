/**
 * CSIE result fetch hook.
 *
 * Reads tenants/{tid}/samples/{sid}/crossSpectrum/latest doc.
 *
 * @phase R185-10c
 */
'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase/client';
import type { CSIEResult } from '@/types/deviation-analysis';

export function useCSIEResult(sampleId: string | null) {
  const [result, setResult] = useState<CSIEResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sampleId) {
      setResult(null);
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    // tenantId from custom claim — fetched in the snapshot listener via user.getIdTokenResult
    let unsub: (() => void) | null = null;

    user.getIdTokenResult().then((tokenResult) => {
      const tenantId = tokenResult.claims.tenantId as string | undefined;
      if (!tenantId) {
        setLoading(false);
        return;
      }

      const db = getFirebaseFirestore();
      const ref = doc(db, 'tenants', tenantId, 'samples', sampleId, 'crossSpectrum', 'latest');
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            setResult(snap.data() as CSIEResult);
          } else {
            setResult(null);
          }
          setLoading(false);
        },
        (err) => {
          console.warn('CSIE snapshot error', err);
          setResult(null);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsub) unsub();
    };
  }, [sampleId]);

  return { result, loading };
}
