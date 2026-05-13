'use client';
/**
 * Firestore queries for bookings.
 * @phase R160-data-2
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
import type { Booking } from '@/types/bookings';

function fromSnapshot(snap: DocumentSnapshot): Booking | null {
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id } as Booking;
}

export function useBookings() {
  const tenantId = useTenantId();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = query(collection(db(), `tenants/${tenantId}/bookings`), orderBy('startAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBookings(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Booking));
        setLoading(false);
      },
      (err) => {
        console.error('useBookings listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return { bookings, loading };
}

export function useBooking(bookingId: string | null) {
  const tenantId = useTenantId();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !bookingId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/bookings/${bookingId}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setBooking(fromSnapshot(snap));
        setLoading(false);
      },
      (err) => {
        console.error('useBooking listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, bookingId]);

  return { booking, loading };
}
