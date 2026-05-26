'use client';

/**
 * Client-side Firestore persistence for per-user, per-figure Figure Studio
 * configs. Stored as a flat collection under the tenant so a measurement's
 * figures (and different users' personalisations) are independent documents,
 * and the scientific data in the measurement doc stays clean for BigQuery
 * export (B1). Doc id = `${measurementId}__${figureKey}__${userId}`.
 *
 * @phase R210 (R5.4 — Figure Studio persistence)
 */

import { doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { collection } from 'firebase/firestore';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { FigureConfig } from '@/features/spectra/figure-config';

const COLLECTION = 'figureConfigs';

function docId(measurementId: string, figureKey: string, userId: string): string {
  return `${measurementId}__${figureKey}__${userId}`;
}

interface FigureConfigDoc {
  tenantId: string;
  measurementId: string;
  figureKey: string;
  userId: string;
  config: FigureConfig;
  updatedAt: number;
}

/**
 * Load all saved figure configs for a measurement, for the current user.
 * Returns a map keyed by figureKey. Empty map on no data / not signed in /
 * any error (persistence is best-effort and must never block rendering).
 */
export async function loadFigureConfigs(
  tenantId: string,
  measurementId: string
): Promise<Record<string, FigureConfig>> {
  const userId = getFirebaseAuth().currentUser?.uid;
  if (!userId) return {};
  try {
    const colRef = collection(db(), `tenants/${tenantId}/${COLLECTION}`);
    const q = query(
      colRef,
      where('measurementId', '==', measurementId),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    const out: Record<string, FigureConfig> = {};
    snap.forEach((d) => {
      const data = d.data() as FigureConfigDoc;
      if (data.figureKey && data.config) out[data.figureKey] = data.config;
    });
    return out;
  } catch {
    return {};
  }
}

/**
 * Save one figure's config for the current user. Best-effort: swallows errors
 * so a transient write failure never breaks the editing UX.
 */
export async function saveFigureConfig(
  tenantId: string,
  measurementId: string,
  figureKey: string,
  config: FigureConfig
): Promise<void> {
  const userId = getFirebaseAuth().currentUser?.uid;
  if (!userId) return;
  try {
    const id = docId(measurementId, figureKey, userId);
    const ref = doc(db(), `tenants/${tenantId}/${COLLECTION}/${id}`);
    const payload: FigureConfigDoc = {
      tenantId,
      measurementId,
      figureKey,
      userId,
      config,
      updatedAt: Date.now()
    };
    await setDoc(ref, payload);
  } catch {
    // best-effort; ignore
  }
}
