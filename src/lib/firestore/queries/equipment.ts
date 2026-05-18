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
 * Firestore queries for equipment.
 * @phase R160-data-2
 */
import { useEffect, useState } from 'react';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { Equipment } from '@/types/equipment';

function fromSnapshot(snap: DocumentSnapshot): Equipment | null {
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id } as Equipment;
}

export function useEquipmentList() {
  const tenantId = useTenantId();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = query(
      collection(db(), `tenants/${tenantId}/equipment`),
      orderBy('updatedAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEquipment(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Equipment));
        setLoading(false);
      },
      (err) => {
        console.error('useEquipmentList listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return { equipment, loading };
}

export function useEquipment(equipmentId: string | null) {
  const tenantId = useTenantId();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !equipmentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/equipment/${equipmentId}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setEquipment(fromSnapshot(snap));
        setLoading(false);
      },
      (err) => {
        console.error('useEquipment listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, equipmentId]);

  return { equipment, loading };
}
