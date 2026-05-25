/**
 * Reference service: CRUD + versioning + lineage to Paper.
 *
 * Path: tenants/{tenantId}/references/{referenceId}
 * Versions: tenants/{tenantId}/references/{referenceId}/versions/{vId}
 *
 * Replaces R162/R163 reference_cards collection in Phase 6.
 *
 * @phase R164-phase-3c
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { generateEntityId } from '@/lib/prov/id-generator';
import { buildDeprecatePatch, reactivateDocTx, retractDocTx } from '@/lib/prov/lifecycle';
import type { CreateAnyReferenceInput } from '@/lib/schemas/reference-schema';
import type { LifecycleStatus } from '@/types/prov-base';
import type {
  FTIRReference,
  RamanReference,
  Reference,
  ReferenceVersion,
  UVVisReference,
  XRDReference
} from '@/types/references';

const COLLECTION = 'references';
const VERSIONS_SUB = 'versions';

interface CreateReferenceContext {
  tenantId: string;
  createdBy: string;
}

export async function createReference(
  input: CreateAnyReferenceInput,
  ctx: CreateReferenceContext
): Promise<Reference> {
  const db = getAdminFirestoreService();
  const id = await generateEntityId(
    db,
    ctx.tenantId,
    'references',
    input.cardNumber || input.phaseName
  );
  const now = Date.now();

  const provFields = {
    id,
    tenantId: ctx.tenantId,
    schemaVersion: 1 as const,
    createdBy: ctx.createdBy,
    createdAt: now,
    derivedFrom: input.derivedFrom ?? (input.paperId ? [input.paperId] : undefined),
    generatedBy: input.generatedBy,
    lifecycleStatus: 'active' as const,
    currentVersion: 1
  };

  let reference: Reference;
  switch (input.spectrumType) {
    case 'xrd': {
      const xrd: XRDReference = {
        ...provFields,
        spectrumType: 'xrd',
        cardNumber: input.cardNumber,
        phaseName: input.phaseName,
        formula: input.formula,
        source: input.source,
        sourceUrl: input.sourceUrl,
        paperId: input.paperId,
        notes: input.notes,
        spaceGroup: input.spaceGroup,
        anode: input.anode,
        peaks: input.peaks
      };
      reference = xrd;
      break;
    }
    case 'ftir': {
      const ftir: FTIRReference = {
        ...provFields,
        spectrumType: 'ftir',
        cardNumber: input.cardNumber,
        phaseName: input.phaseName,
        formula: input.formula,
        source: input.source,
        sourceUrl: input.sourceUrl,
        paperId: input.paperId,
        notes: input.notes,
        mode: input.mode,
        peaks: input.peaks
      };
      reference = ftir;
      break;
    }
    case 'raman': {
      const raman: RamanReference = {
        ...provFields,
        spectrumType: 'raman',
        cardNumber: input.cardNumber,
        phaseName: input.phaseName,
        formula: input.formula,
        source: input.source,
        sourceUrl: input.sourceUrl,
        paperId: input.paperId,
        notes: input.notes,
        laserWavelength: input.laserWavelength,
        peaks: input.peaks
      };
      reference = raman;
      break;
    }
    case 'uvvis': {
      const uvvis: UVVisReference = {
        ...provFields,
        spectrumType: 'uvvis',
        cardNumber: input.cardNumber,
        phaseName: input.phaseName,
        formula: input.formula,
        source: input.source,
        sourceUrl: input.sourceUrl,
        paperId: input.paperId,
        notes: input.notes,
        solvent: input.solvent,
        peaks: input.peaks
      };
      reference = uvvis;
      break;
    }
    default: {
      // Exhaustive check
      const _exhaustive: never = input;
      throw new Error(
        `Unsupported reference spectrumType: ${(_exhaustive as { spectrumType: string }).spectrumType}`
      );
    }
  }

  await db.collection('tenants').doc(ctx.tenantId).collection(COLLECTION).doc(id).set(reference);

  return reference;
}

export async function getReference(tenantId: string, id: string): Promise<Reference | null> {
  const doc = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .get();
  if (!doc.exists) return null;
  return doc.data() as Reference;
}

export interface ListReferencesOptions {
  includeDeprecated?: boolean;
  includeRetracted?: boolean;
  spectrumType?: 'xrd' | 'ftir' | 'raman' | 'uvvis';
  formula?: string;
  limit?: number;
}

export async function listReferences(
  tenantId: string,
  opts: ListReferencesOptions = {}
): Promise<Reference[]> {
  const db = getAdminFirestoreService();
  let q: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection(COLLECTION);

  const allowedStatuses: LifecycleStatus[] = ['active'];
  if (opts.includeDeprecated) allowedStatuses.push('deprecated');
  if (opts.includeRetracted) allowedStatuses.push('retracted');
  q = q.where('lifecycleStatus', 'in', allowedStatuses);

  if (opts.spectrumType) q = q.where('spectrumType', '==', opts.spectrumType);
  if (opts.formula) q = q.where('formula', '==', opts.formula);
  q = q.orderBy('createdAt', 'desc');
  if (opts.limit) q = q.limit(opts.limit);

  const snap = await q.get();
  return snap.docs.map((d) => d.data() as Reference);
}

interface UpdateReferenceContext {
  tenantId: string;
  updatedBy: string;
  changeNote?: string;
}

/**
 * Update reference with versioning (snapshot prior state).
 *
 * Patch is a partial of the discriminated Reference union — caller MUST
 * supply only fields valid for the existing spectrumType. spectrumType
 * itself CANNOT be changed (would corrupt peaks shape).
 */
export async function updateReference(
  id: string,
  patch: Partial<Omit<Reference, 'id' | 'tenantId' | 'spectrumType' | 'currentVersion'>>,
  ctx: UpdateReferenceContext
): Promise<Reference | null> {
  const db = getAdminFirestoreService();
  const ref = db.collection('tenants').doc(ctx.tenantId).collection(COLLECTION).doc(id);

  return db.runTransaction(async (tx) => {
    const before = await tx.get(ref);
    if (!before.exists) return null;
    const current = before.data() as Reference;

    const now = Date.now();
    const vId = `v${current.currentVersion}_${now}`;
    const versionDoc: ReferenceVersion = {
      id: vId,
      version: current.currentVersion,
      content: current,
      changedBy: ctx.updatedBy,
      changedAt: now,
      changeNote: ctx.changeNote
    };
    tx.set(ref.collection(VERSIONS_SUB).doc(vId), versionDoc);

    tx.update(ref, {
      ...patch,
      currentVersion: current.currentVersion + 1,
      updatedAt: now,
      updatedBy: ctx.updatedBy
    });

    return {
      ...current,
      ...patch,
      currentVersion: current.currentVersion + 1,
      updatedAt: now,
      updatedBy: ctx.updatedBy
    } as Reference;
  });
}

export async function listReferenceVersions(
  tenantId: string,
  referenceId: string
): Promise<ReferenceVersion[]> {
  const snap = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(referenceId)
    .collection(VERSIONS_SUB)
    .orderBy('version', 'desc')
    .get();
  return snap.docs.map((d) => d.data() as ReferenceVersion);
}

export async function deprecateReference(
  id: string,
  tenantId: string,
  userId: string,
  reason?: string
): Promise<void> {
  await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .update(buildDeprecatePatch(userId, { reason }));
}

export async function retractReference(
  id: string,
  tenantId: string,
  userId: string,
  reason: string
): Promise<void> {
  const ref = getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id);
  await retractDocTx(ref, userId, reason);
}

export async function reactivateReference(
  id: string,
  tenantId: string,
  userId: string
): Promise<void> {
  const ref = getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id);
  await reactivateDocTx(ref, userId);
}

/**
 * Find references linked to a paper (forward lineage).
 */
export async function findReferencesByPaper(
  tenantId: string,
  paperId: string
): Promise<Reference[]> {
  const snap = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .where('paperId', '==', paperId)
    .where('lifecycleStatus', '==', 'active')
    .get();
  return snap.docs.map((d) => d.data() as Reference);
}
