/**
 * Client-side query for materialProfiles root collection.
 * Public read for signed-in users (see firestore.rules R183-2).
 *
 * @phase R183-3-material-knowledge-panel
 */
'use client';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { MaterialProfile } from '@/types/material-profiles';

export function useMaterialProfile(formula: string | null) {
  const [profile, setProfile] = useState<MaterialProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!formula || formula.trim().length < 2) {
      setProfile(null);
      return;
    }
    // Normalize: trim whitespace, keep original case (FormulaSchema = capital first)
    const normalized = formula.trim();
    setLoading(true);
    getDoc(doc(db(), 'materialProfiles', normalized))
      .then((snap) => {
        setProfile(snap.exists() ? ({ id: snap.id, ...snap.data() } as MaterialProfile) : null);
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [formula]);

  return { profile, loading };
}
