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
 * Client-side Firestore queries for materials.
 * Realtime via onSnapshot.
 * @phase R160-data-1
 */
import { useEffect, useState } from 'react';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { Material } from '@/types/materials';
import { safeDoc, safeDocs } from '@/lib/firestore/safe';
import { MaterialDocSchema } from '@/lib/schemas/material-schema';

function materialFromSnapshot(snap: DocumentSnapshot): Material | null {
  return safeDoc(snap, MaterialDocSchema, 'materials') as Material | null;
}

export function useMaterials() {
  const tenantId = useTenantId();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = query(
      collection(db(), `tenants/${tenantId}/materials`),
      orderBy('updatedAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMaterials(
          (safeDocs(snap.docs, MaterialDocSchema, 'materials') as Material[]).filter(
            (x) => x.lifecycleStatus !== 'deprecated' && x.lifecycleStatus !== 'retracted'
          )
        );
        setLoading(false);
      },
      (err) => {
        console.error('useMaterials listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return { materials, loading };
}

export function useMaterial(materialId: string | null) {
  const tenantId = useTenantId();
  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !materialId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/materials/${materialId}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setMaterial(materialFromSnapshot(snap));
        setLoading(false);
      },
      (err) => {
        console.error('useMaterial listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, materialId]);

  return { material, loading };
}
