/**
 * Reference card service: CRUD over Firestore.
 *
 * Path: tenants/{tenantId}/reference_cards/{cardId}
 *
 * @phase R160-spectra-4a-pdf
 */
import { randomUUID } from 'node:crypto';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { ReferenceCard, ReferenceCardPeak } from '@/types/spectra';

const COLLECTION = 'reference_cards';

interface CreateReferenceCardInput {
  tenantId: string;
  cardNumber: string;
  phaseName: string;
  formula?: string;
  spaceGroup?: string;
  anode?: string;
  peaks: ReferenceCardPeak[];
  notes?: string;
  createdBy: string;
}

export async function createReferenceCard(input: CreateReferenceCardInput): Promise<ReferenceCard> {
  const id = randomUUID();
  const now = Date.now();
  // R163-4c-2: legacy createReferenceCard is XRD-only.
  // FTIR/Raman/UVVis variants will get dedicated create functions in 4c-3.
  const card: import('@/types/spectra').XRDReferenceCard = {
    id,
    tenantId: input.tenantId,
    spectrumType: 'xrd',
    cardNumber: input.cardNumber,
    phaseName: input.phaseName,
    formula: input.formula,
    spaceGroup: input.spaceGroup,
    anode: input.anode,
    source: 'manual',
    peaks: input.peaks,
    notes: input.notes,
    createdBy: input.createdBy,
    createdAt: now
  };
  await getAdminFirestoreService()
    .collection('tenants')
    .doc(input.tenantId)
    .collection(COLLECTION)
    .doc(id)
    .set(card);
  return card;
}

export async function listReferenceCards(
  tenantId: string,
  filter?: { formula?: string }
): Promise<ReferenceCard[]> {
  let query = getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(100);
  if (filter?.formula) {
    query = query.where('formula', '==', filter.formula);
  }
  const snap = await query.get();
  // R163-bc-read: backward-compat default spectrumType
  return snap.docs.map((d) => {
    const data = d.data() as ReferenceCard & Partial<{ spectrumType: string }>;
    if (!data.spectrumType) (data as { spectrumType: string }).spectrumType = 'xrd';
    return data as ReferenceCard;
  });
}

export async function getReferenceCard(
  tenantId: string,
  cardId: string
): Promise<ReferenceCard | null> {
  const doc = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(cardId)
    .get();
  if (!doc.exists) return null;
  const data = doc.data() as ReferenceCard & Partial<{ spectrumType: string }>;
  // R163-bc-read: legacy cards lack spectrumType → default 'xrd'
  if (!data.spectrumType) (data as { spectrumType: string }).spectrumType = 'xrd';
  return data as ReferenceCard;
}

export async function deleteReferenceCard(tenantId: string, cardId: string): Promise<void> {
  await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(cardId)
    .delete();
}

export interface UpdateReferenceCardPatch {
  phaseName?: string;
  formula?: string;
  anode?: string;
  spaceGroup?: string;
  notes?: string;
}

/**
 * Patch metadata fields only — peaks are immutable (re-paste → new card).
 * @phase R162-refcard-edit
 */
export async function updateReferenceCard(
  tenantId: string,
  cardId: string,
  patch: UpdateReferenceCardPatch
): Promise<ReferenceCard | null> {
  const ref = getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(cardId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  // Filter undefined so we don't overwrite existing values with undefined
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) cleaned[k] = v;
  }
  cleaned.updatedAt = Date.now();
  await ref.update(cleaned);
  const after = await ref.get();
  return after.data() as ReferenceCard;
}

// R162-4b-client-server-fix — moved to src/lib/spectra/match-score.ts (client-safe).
// Re-exported for any existing server callers that imported from this module.
export { matchScore } from '@/lib/spectra/match-score';
