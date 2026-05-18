'use client';
import {
  collection,
  type DocumentSnapshot,
  doc,
  onSnapshot,
  orderBy,
  query,
  where
} from 'firebase/firestore';
/**
 * Firestore queries for spectra.
 * @phase R164-phase-5b-1 (was R160-spectra-1) — collection renamed spectra→measurements
 */
import { useEffect, useState } from 'react';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { SpectrumMetadata } from '@/types/spectra';

function fromSnapshot(snap: DocumentSnapshot): SpectrumMetadata | null {
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id } as SpectrumMetadata;
}

/** List all spectra in tenant (limited 100) */
export function useAllSpectra() {
  const tenantId = useTenantId();
  const [spectra, setSpectra] = useState<SpectrumMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = query(
      collection(db(), `tenants/${tenantId}/measurements`),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSpectra(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as SpectrumMetadata));
        setLoading(false);
      },
      (err) => {
        console.error('useAllSpectra listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return { spectra, loading };
}

/** Spectra for a specific experiment */
export function useSpectraByExperiment(experimentId: string | null) {
  const tenantId = useTenantId();
  const [spectra, setSpectra] = useState<SpectrumMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !experimentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db(), `tenants/${tenantId}/measurements`),
      where('experimentId', '==', experimentId),
      orderBy('measuredAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSpectra(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as SpectrumMetadata));
        setLoading(false);
      },
      (err) => {
        console.error('useSpectraByExperiment error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, experimentId]);

  return { spectra, loading };
}

/** Single spectrum */
export function useSpectrum(spectrumId: string | null) {
  const tenantId = useTenantId();
  const [spectrum, setSpectrum] = useState<SpectrumMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !spectrumId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/measurements/${spectrumId}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSpectrum(fromSnapshot(snap));
        setLoading(false);
      },
      (err) => {
        console.error('useSpectrum error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, spectrumId]);

  return { spectrum, loading };
}
