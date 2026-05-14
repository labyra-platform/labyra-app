/**
 * Document ID generator (PROV-O entities + activities).
 *
 * Entities (slow-changing, conceptual identity):
 *   - slug + sequence: `mat_wo3_001`, `sam_wo3_batch_001`, etc.
 *   - Counter stored at `tenants/{tid}/_counters/{collection}`
 *
 * Activities (high-volume, machine-generated):
 *   - Random UUID via crypto.randomUUID()
 *
 * @phase R164-phase-2-schemas
 */
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export type EntityCollection = 'materials' | 'samples' | 'experiments' | 'papers' | 'references';

export type ActivityCollection = 'measurements' | 'analyses';

// Prefix map for entity slug IDs
const PREFIX_MAP: Record<EntityCollection, string> = {
  materials: 'mat',
  samples: 'sam',
  experiments: 'exp',
  papers: 'pap',
  references: 'ref'
};

/**
 * Slugify a name into URL-safe lowercase token. Max 30 chars.
 *
 * Examples:
 *   "WO3 monoclinic" → "wo3_monoclinic"
 *   "Smith et al. (2014) — MoS2 study" → "smith_et_al_2014_mos2_study"
 */
export function slugify(name: string, maxLen: number = 30): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_') // non-alphanumeric → underscore
    .replace(/^_+|_+$/g, '') // trim leading/trailing
    .slice(0, maxLen);
}

/**
 * Generate slug + sequence ID for an entity.
 *
 * Atomic increment of `tenants/{tid}/_counters/{collection}` via
 * Firestore FieldValue.increment(1). Guaranteed unique per tenant.
 *
 * Returns: `<prefix>_<slug>_<3-digit-seq>` e.g. `mat_wo3_001`.
 */
export async function generateEntityId(
  db: Firestore,
  tenantId: string,
  collection: EntityCollection,
  name: string
): Promise<string> {
  const slug = slugify(name);
  const counterRef = db.collection('tenants').doc(tenantId).collection('_counters').doc(collection);

  // Atomic transaction: read seq, increment, return new value
  const seq = await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = (doc.exists ? (doc.data()?.seq as number) : 0) || 0;
    const next = current + 1;
    tx.set(counterRef, { seq: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });

  const prefix = PREFIX_MAP[collection];
  const seqStr = String(seq).padStart(3, '0');
  return `${prefix}_${slug}_${seqStr}`;
}

/**
 * Generate activity ID (random UUID, no counter needed).
 * Activities are high-volume, no human-grep need.
 */
export function generateActivityId(): string {
  return crypto.randomUUID();
}
