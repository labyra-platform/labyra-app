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

/**
 * R577: the reorder threshold can be absolute or a percentage.
 *
 * Absolute is unchanged: reorder when quantity <= reorderThreshold, in the
 * chemical's unit. Percent needs a baseline — 10% of what? — and the honest
 * baseline is the amount on hand when the threshold was set, captured as
 * reorderReference. So a 10% threshold on a 500 g stock fires at 50 g. Percent
 * with no reference cannot be evaluated and is treated as no threshold rather
 * than guessed, so it never silently mis-fires.
 */
function effectiveThreshold(
  reorderThreshold: number | undefined,
  reorderMode: 'absolute' | 'percent' | undefined,
  reorderReference: number | undefined
): number | undefined {
  if (reorderThreshold === undefined) return undefined;
  if (reorderMode === 'percent') {
    if (reorderReference === undefined || reorderReference <= 0) return undefined;
    return (reorderReference * reorderThreshold) / 100;
  }
  return reorderThreshold;
}

function deriveStatus(
  quantity: number,
  reorderThreshold: number | undefined,
  expiryAt: number | undefined,
  reorderMode?: 'absolute' | 'percent',
  reorderReference?: number,
  expiryKind?: 'expiry' | 'retest' | 'none'
): ChemicalStatus {
  // R579 (datepicker-grid.md §7): only a real expiry marks the chemical expired.
  // A retest date past due does not — the material is still usable, the overdue
  // retest is a prompt, not a block. 'none' has no date to check.
  if (expiryKind !== 'retest' && expiryKind !== 'none' && expiryAt && expiryAt < Date.now()) {
    return 'expired';
  }
  if (quantity <= 0) return 'empty';
  const threshold = effectiveThreshold(reorderThreshold, reorderMode, reorderReference);
  if (threshold !== undefined && quantity <= threshold) return 'low';
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
  reorderMode?: 'absolute' | 'percent';
  location?: string;
  storageConditions?: string;
  expiryAt?: number;
  expiryKind?: 'expiry' | 'retest' | 'none';
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
    reorderMode: input.reorderMode ?? 'absolute',
    // R577: for a percent threshold, the baseline is the amount on hand at
    // creation. Stored once here so the status check has a fixed reference
    // rather than a moving one — a percentage that re-based on current quantity
    // could never trigger, since quantity is always 100% of itself.
    reorderReference: input.reorderMode === 'percent' ? input.quantity : undefined,
    location: input.location,
    storageConditions: input.storageConditions,
    expiryAt: input.expiryAt,
    expiryKind: input.expiryKind ?? (input.expiryAt ? 'expiry' : 'none'),
    status: deriveStatus(
      input.quantity,
      input.reorderThreshold,
      input.expiryAt,
      input.reorderMode ?? 'absolute',
      input.reorderMode === 'percent' ? input.quantity : undefined,
      input.expiryKind ?? (input.expiryAt ? 'expiry' : 'none')
    ),
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

  // R577: resolve the effective reorder mode + reference for this update.
  const nextMode = patch.reorderMode ?? current.reorderMode ?? 'absolute';
  // If the edit switches to percent, re-baseline on the current quantity — the
  // stored reference from a prior percent setting (or none) would otherwise be
  // stale. Staying in percent keeps the existing reference; absolute drops it.
  let nextReference = current.reorderReference;
  if (nextMode === 'percent') {
    const switchingToPercent = current.reorderMode !== 'percent';
    if (switchingToPercent || current.reorderReference === undefined) {
      nextReference = current.quantity;
    }
  } else {
    nextReference = undefined;
  }
  updated.reorderMode = nextMode;
  updated.reorderReference = nextReference;

  // Recompute status if threshold/expiry/mode change (quantity unchanged here).
  updated.status = deriveStatus(
    current.quantity,
    patch.reorderThreshold ?? current.reorderThreshold,
    patch.expiryAt ?? current.expiryAt,
    nextMode,
    nextReference,
    patch.expiryKind ?? current.expiryKind
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

    // R577: percent thresholds matter most here — this is where a consume drops
    // stock below the reference-derived level. Pass the stored mode + reference
    // so a percent threshold actually fires on depletion.
    const newStatus = deriveStatus(
      newQuantity,
      chem.reorderThreshold,
      chem.expiryAt,
      chem.reorderMode,
      chem.reorderReference,
      chem.expiryKind
    );

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
