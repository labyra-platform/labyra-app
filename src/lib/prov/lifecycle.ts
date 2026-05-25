/**
 * Lifecycle management helpers (PROV-O retraction semantics).
 *
 * - deprecate: superseded but referenced — UI hides by default
 * - retract: scientifically invalid — UI hides + audit log only
 * - reactivate: undo deprecation (cannot undo retraction)
 *
 * Applied to entities + activities uniformly via ProvBase.lifecycleStatus.
 *
 * @phase R164-phase-2-schemas
 * @phase R243-idempotent-tx — retractDocTx / reactivateDocTx (audit M4)
 */
// R165-phase-1-oxlint: oxlint cleanup
import {
  type DocumentData,
  type DocumentReference,
  FieldValue,
  getFirestore,
  type UpdateData
} from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from '@/lib/firebase/admin';
import type { LifecycleStatus } from '@/types/prov-base';

export interface DeprecateInput {
  reason?: string;
}

export interface RetractInput {
  reason: string; // required for retraction (compliance)
}

/**
 * Build the update patch for a soft delete (deprecate).
 *
 * Caller applies via Firestore update().
 */
export function buildDeprecatePatch(
  userId: string,
  input: DeprecateInput
): Record<string, unknown> {
  return {
    lifecycleStatus: 'deprecated' satisfies LifecycleStatus,
    retractedAt: Date.now(),
    retractedBy: userId,
    retractedReason: input.reason ?? 'deprecated',
    updatedAt: Date.now(),
    updatedBy: userId
  };
}

/**
 * Build the update patch for retraction (scientific invalidity).
 */
export function buildRetractPatch(userId: string, input: RetractInput): Record<string, unknown> {
  return {
    lifecycleStatus: 'retracted' satisfies LifecycleStatus,
    retractedAt: Date.now(),
    retractedBy: userId,
    retractedReason: input.reason,
    updatedAt: Date.now(),
    updatedBy: userId
  };
}

/**
 * Build the update patch to reactivate a deprecated entity.
 * Cannot reactivate retracted entities (immutable per compliance).
 */
export function buildReactivatePatch(userId: string): Record<string, unknown> {
  return {
    lifecycleStatus: 'active' satisfies LifecycleStatus,
    retractedAt: FieldValue.delete(),
    retractedBy: FieldValue.delete(),
    retractedReason: FieldValue.delete(),
    updatedAt: Date.now(),
    updatedBy: userId
  };
}

/**
 * Helper: should this entity be excluded from default list views?
 */
export function isHiddenByDefault(status: LifecycleStatus): boolean {
  return status === 'deprecated' || status === 'retracted';
}

// ---------------------------------------------------------------------------
// R243 (audit M4): idempotent, race-safe lifecycle transitions.
//
// Previously each service did a blind `ref.update(buildRetractPatch(...))`:
// a retried/duplicate POST re-applied the patch (re-timestamp, re-log lineage).
// Reactivate did a non-transactional read-then-write (racy). These helpers do
// the read + decision + write inside a single transaction so the transition is
// applied at most once and concurrent calls cannot interleave.
// ---------------------------------------------------------------------------

function getTxFirestore() {
  return getFirestore(getFirebaseAdminApp());
}

/**
 * Idempotent retraction. No-op if the doc is missing or already retracted.
 * Returns true if a write was applied, false if it was a no-op.
 */
export async function retractDocTx(
  ref: DocumentReference,
  userId: string,
  reason: string
): Promise<boolean> {
  return getTxFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const status = snap.data()?.lifecycleStatus as LifecycleStatus | undefined;
    if (status === 'retracted') return false; // already retracted — idempotent
    tx.update(ref, buildRetractPatch(userId, { reason }) as UpdateData<DocumentData>);
    return true;
  });
}

/**
 * Idempotent reactivation. No-op if missing or already active. Throws if the
 * doc is retracted (immutable per compliance — cannot undo a retraction).
 * Returns true if a write was applied, false if it was a no-op.
 */
export async function reactivateDocTx(ref: DocumentReference, userId: string): Promise<boolean> {
  return getTxFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const status = snap.data()?.lifecycleStatus as LifecycleStatus | undefined;
    if (status === 'retracted') {
      throw new Error('Cannot reactivate retracted entity (immutable per compliance)');
    }
    if (status === 'active' || status === undefined) return false; // already active — idempotent
    tx.update(ref, buildReactivatePatch(userId) as UpdateData<DocumentData>);
    return true;
  });
}
