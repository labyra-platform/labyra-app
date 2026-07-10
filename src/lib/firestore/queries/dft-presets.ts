'use client';

/**
 * Client Firestore CRUD for saved DFT step presets — a per-tenant "favourites"
 * library of parameter sets keyed by calc type. Params are JSON-sanitised so
 * Firestore never sees `undefined`. Security is enforced by rules.
 *
 * @phase R280 — step presets
 */
import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';

import type { DftStepPreset } from '@/features/computation/dft-preset';
import type { NodeParams } from '@/features/computation/compose-model';
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase/client';
import type { DftCalcType } from '@/types/dft';

const SCHEMA_VERSION = 1;

function requireUid(): string {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  return uid;
}

function presetsPath(tenantId: string): string {
  return `tenants/${tenantId}/dftStepPresets`;
}

/** Drop `undefined` (and functions) so the params object is Firestore-safe. */
function sanitizeParams(params: NodeParams): NodeParams {
  return JSON.parse(JSON.stringify(params)) as NodeParams;
}

export async function createDftStepPreset(
  tenantId: string,
  name: string,
  calcType: DftCalcType,
  params: NodeParams
): Promise<void> {
  const db = getFirebaseFirestore();
  const owner = requireUid();
  const now = Date.now();
  const payload: Omit<DftStepPreset, 'id'> = {
    tenantId,
    schemaVersion: SCHEMA_VERSION,
    createdBy: owner,
    createdAt: now,
    updatedBy: owner,
    updatedAt: now,
    lifecycleStatus: 'active',
    name: name.trim(),
    calcType,
    params: sanitizeParams(params)
  };
  await addDoc(collection(db, presetsPath(tenantId)), payload);
}

export async function deleteDftStepPreset(tenantId: string, presetId: string): Promise<void> {
  const db = getFirebaseFirestore();
  await deleteDoc(doc(db, presetsPath(tenantId), presetId));
}
