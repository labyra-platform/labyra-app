/**
 * Firestore queries for AnalysisResult.
 * @phase R160-spectra-3b
 */

import 'server-only';

import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { AnalysisResult } from '@/types/spectra-analysis';
import type { SpectrumMetadata } from '@/types/spectra';

/**
 * Fetch the latest AnalysisResult for a spectrum.
 * Returns null if no analysis has been written yet.
 */
export async function getLatestAnalysis(
  tenantId: string,
  spectrumId: string
): Promise<AnalysisResult | null> {
  const db = getAdminFirestoreService();
  const ref = db.doc(`tenants/${tenantId}/spectra/${spectrumId}/analysis/latest`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as AnalysisResult;
}

/**
 * Fetch a spectrum's metadata document (instrument config, technique, lineage).
 * Server-only; returns null if the spectrum no longer exists. Used by manuscript
 * Methods grounding to describe the real characterization instruments/parameters.
 */
export async function getSpectrumMeta(
  tenantId: string,
  spectrumId: string
): Promise<SpectrumMetadata | null> {
  const db = getAdminFirestoreService();
  const ref = db.doc(`tenants/${tenantId}/spectra/${spectrumId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as SpectrumMetadata;
}
