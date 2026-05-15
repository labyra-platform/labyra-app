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
 */
// R165-phase-1-oxlint: oxlint cleanup
import { FieldValue } from 'firebase-admin/firestore';
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
