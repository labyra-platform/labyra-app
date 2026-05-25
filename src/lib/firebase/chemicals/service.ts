/**
 * Chemical service — Admin SDK CRUD + event-sourced inventory.
 *
 * Path: tenants/{tenantId}/chemicals/{chemicalId}
 *       tenants/{tenantId}/chemicals/{chemicalId}/transactions/{txId}
 *
 * `quantity` on the chemical doc is a cached projection of the transaction
 * log, updated atomically inside each consume/replenish transaction. The log
 * is the source of truth (audit trail). Deletes are deprecation, never hard.
 *
 * @phase CHEM-1
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { Chemical, ChemicalStatus, ChemicalTransaction, ChemicalUnit } from '@/types/chemical';

function chemCol(tenantId: string) {
  return getAdminFirestoreService().collection(`tenants/${tenantId}/chemicals`);
}

function deriveStatus(
  quantity: number,
  reorderThreshold: number | undefined,
  expiryAt: number | undefined
): ChemicalStatus {
  if (expiryAt && expiryAt < Date.now()) return 'expired';
  if (quantity <= 0) return 'empty';
  if (reorderThreshold !== undefined && quantity <= reorderThreshold) return 'low';
  return 'available';
}

export interface CreateChemicalInput {
  chemicalCode: string;
  name: string;
  casNumber?: string;
  formula?: string;
  ghsHazards: Chemical['ghsHazards'];
  hazardStatements?: string[];
  signalWord?: Chemical['signalWord'];
  purity?: string;
  grade?: string;
  manufacturer?: string;
  catalogNumber?: string;
  lotNumber?: string;
  quantity: number;
  unit: ChemicalUnit;
  state: Chemical['state'];
  reorderThreshold?: number;
  location?: string;
  storageConditions?: string;
  expiryAt?: number;
}

export async function createChemical(
  tenantId: string,
  input: CreateChemicalInput,
  createdBy: string
): Promise<Chemical> {
  const db = getAdminFirestoreService();
  const ref = chemCol(tenantId).doc();
  const now = Date.now();

  const chemical: Chemical = {
    schemaVersion: 1,
    id: ref.id,
    tenantId,
    chemicalCode: input.chemicalCode,
    name: input.name,
    casNumber: input.casNumber,
    formula: input.formula,
    ghsHazards: input.ghsHazards,
    hazardStatements: input.hazardStatements,
    signalWord: input.signalWord,
    purity: input.purity,
    grade: input.grade,
    manufacturer: input.manufacturer,
    catalogNumber: input.catalogNumber,
    lotNumber: input.lotNumber,
    quantity: input.quantity,
    unit: input.unit,
    state: input.state,
    reorderThreshold: input.reorderThreshold,
    location: input.location,
    storageConditions: input.storageConditions,
    expiryAt: input.expiryAt,
    status: deriveStatus(input.quantity, input.reorderThreshold, input.expiryAt),
    lifecycleStatus: 'active',
    createdBy,
    createdAt: now,
    updatedAt: now
  };

  // Strip undefined (Firestore rejects undefined values).
  const clean = JSON.parse(JSON.stringify(chemical)) as Chemical;

  const batch = db.batch();
  batch.set(ref, clean);
  // Seed initial transaction for audit completeness.
  if (input.quantity > 0) {
    const txRef = ref.collection('transactions').doc();
    const initialTx: ChemicalTransaction = {
      id: txRef.id,
      type: 'initial',
      delta: input.quantity,
      unit: input.unit,
      performedBy: createdBy,
      performedAt: now
    };
    batch.set(txRef, initialTx);
  }
  await batch.commit();

  return clean;
}

export async function listChemicals(tenantId: string): Promise<Chemical[]> {
  const snap = await chemCol(tenantId).orderBy('updatedAt', 'desc').limit(500).get();
  return snap.docs
    .map((d) => ({ ...(d.data() as Chemical), id: d.id }))
    .filter((c) => c.lifecycleStatus !== 'retracted');
}

export async function getChemical(tenantId: string, id: string): Promise<Chemical | null> {
  const snap = await chemCol(tenantId).doc(id).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as Chemical), id: snap.id };
}

export async function updateChemical(
  tenantId: string,
  id: string,
  patch: Partial<CreateChemicalInput>
): Promise<void> {
  const ref = chemCol(tenantId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('chemical_not_found');
  const current = snap.data() as Chemical;

  const updated: Record<string, unknown> = { ...patch, updatedAt: Date.now() };
  // Recompute status if threshold/expiry change (quantity unchanged here).
  updated.status = deriveStatus(
    current.quantity,
    patch.reorderThreshold ?? current.reorderThreshold,
    patch.expiryAt ?? current.expiryAt
  );
  const clean = JSON.parse(JSON.stringify(updated));
  await ref.update(clean);
}

export async function deprecateChemical(tenantId: string, id: string): Promise<void> {
  const ref = chemCol(tenantId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('chemical_not_found');
  await ref.update({ lifecycleStatus: 'deprecated', updatedAt: Date.now() });
}

export async function reactivateChemical(tenantId: string, id: string): Promise<void> {
  const ref = chemCol(tenantId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('chemical_not_found');
  await ref.update({ lifecycleStatus: 'active', updatedAt: Date.now() });
}

/**
 * Apply an inventory transaction (consume = negative, replenish = positive).
 * Atomically appends to the log and updates the cached quantity + status.
 */
export async function applyTransaction(
  tenantId: string,
  chemicalId: string,
  input: {
    type: 'consume' | 'replenish' | 'adjust';
    amount: number;
    reason?: string;
    experimentId?: string;
  },
  performedBy: string
): Promise<{ quantity: number; status: ChemicalStatus }> {
  const db = getAdminFirestoreService();
  const ref = chemCol(tenantId).doc(chemicalId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('chemical_not_found');
    const chem = snap.data() as Chemical;

    const delta = input.type === 'consume' ? -Math.abs(input.amount) : Math.abs(input.amount);
    const newQuantity = Number((chem.quantity + delta).toFixed(6));
    if (newQuantity < 0) throw new Error('insufficient_quantity');

    const newStatus = deriveStatus(newQuantity, chem.reorderThreshold, chem.expiryAt);

    const txRef = ref.collection('transactions').doc();
    const txDoc: ChemicalTransaction = {
      id: txRef.id,
      type: input.type,
      delta,
      unit: chem.unit,
      reason: input.reason,
      experimentId: input.experimentId,
      performedBy,
      performedAt: Date.now()
    };
    tx.set(txRef, JSON.parse(JSON.stringify(txDoc)));
    tx.update(ref, { quantity: newQuantity, status: newStatus, updatedAt: Date.now() });

    return { quantity: newQuantity, status: newStatus };
  });
}

export async function listTransactions(
  tenantId: string,
  chemicalId: string
): Promise<ChemicalTransaction[]> {
  const snap = await chemCol(tenantId)
    .doc(chemicalId)
    .collection('transactions')
    .orderBy('performedAt', 'desc')
    .limit(100)
    .get();
  return snap.docs.map((d) => ({ ...(d.data() as ChemicalTransaction), id: d.id }));
}
