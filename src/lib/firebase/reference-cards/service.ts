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
  const card: ReferenceCard = {
    id,
    tenantId: input.tenantId,
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
  return snap.docs.map((d) => d.data() as ReferenceCard);
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
  return doc.exists ? (doc.data() as ReferenceCard) : null;
}

export async function deleteReferenceCard(tenantId: string, cardId: string): Promise<void> {
  await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(cardId)
    .delete();
}

/**
 * Match score: compare user peaks against reference card.
 * Returns 0-1 (1 = perfect match).
 *
 * Method: count matched peaks within tolerance, weight by intensity.
 */
export function matchScore(
  userPeaks: { twoTheta: number; intensity?: number }[],
  refPeaks: ReferenceCardPeak[],
  toleranceDeg = 0.3
): {
  score: number;
  matchedCount: number;
  totalRef: number;
  details: { ref2t: number; userIdx: number | null; matched: boolean }[];
} {
  const details: { ref2t: number; userIdx: number | null; matched: boolean }[] = [];
  let weightedMatched = 0;
  let weightedTotal = 0;

  for (const ref of refPeaks) {
    const weight = ref.intensity / 100;
    weightedTotal += weight;
    let bestIdx: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < userPeaks.length; i++) {
      const d = Math.abs(userPeaks[i].twoTheta - ref.twoTheta);
      if (d <= toleranceDeg && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx !== null) {
      weightedMatched += weight;
    }
    details.push({ ref2t: ref.twoTheta, userIdx: bestIdx, matched: bestIdx !== null });
  }

  return {
    score: weightedTotal > 0 ? weightedMatched / weightedTotal : 0,
    matchedCount: details.filter((d) => d.matched).length,
    totalRef: refPeaks.length,
    details
  };
}
