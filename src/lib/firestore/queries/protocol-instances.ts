'use client';

/**
 * Client-side Firestore CRUD for an experiment's protocol instance — a single doc
 * at tenants/{tid}/experiments/{eid}/protocol/main. Creating one clones a template
 * (snapshot): steps + edges are copied, inputs become the run's overridable values,
 * every step starts 'planned'. Security is enforced by rules.
 *
 * @phase R271 — Protocol Instance (data layer)
 */
import { doc, setDoc, updateDoc } from 'firebase/firestore';

import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase/client';
import type {
  ProtocolInstance,
  ProtocolInstanceStep,
  ProtocolStepStatus
} from '@/types/protocol-instance';
import type { ProtocolInput, ProtocolTemplate } from '@/types/protocol-template';

const SCHEMA_VERSION = 1;

function requireUid(): string {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  return uid;
}

/** Fixed single-doc path for an experiment's protocol instance. */
export function instancePath(tenantId: string, experimentId: string): string {
  return `tenants/${tenantId}/experiments/${experimentId}/protocol/main`;
}

function cloneStep(s: ProtocolTemplate['steps'][number]): ProtocolInstanceStep {
  const step: ProtocolInstanceStep = {
    id: s.id,
    label: s.label,
    kind: s.kind,
    inputs: (s.inputs ?? []).map((i) => ({
      id: i.id,
      label: i.label,
      ...(i.value ? { value: i.value } : {})
    })),
    status: 'planned'
  };
  if (s.subtitle) step.subtitle = s.subtitle;
  return step;
}

/** Create (or overwrite) an experiment's protocol instance by cloning a template. */
export async function createInstanceFromTemplate(
  tenantId: string,
  experimentId: string,
  template: ProtocolTemplate
): Promise<void> {
  const db = getFirebaseFirestore();
  const owner = requireUid();
  const now = Date.now();
  const payload: ProtocolInstance = {
    id: 'main',
    tenantId,
    schemaVersion: SCHEMA_VERSION,
    createdBy: owner,
    createdAt: now,
    updatedBy: owner,
    updatedAt: now,
    lifecycleStatus: 'active',
    experimentId,
    templateId: template.id,
    templateName: template.name,
    steps: template.steps.map(cloneStep),
    edges: template.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
  };
  await setDoc(doc(db, instancePath(tenantId, experimentId)), payload);
}

/** Persist the full step list (after editing overrides / status). */
export async function updateInstanceSteps(
  tenantId: string,
  experimentId: string,
  steps: ProtocolInstanceStep[]
): Promise<void> {
  const db = getFirebaseFirestore();
  const editor = requireUid();
  await updateDoc(doc(db, instancePath(tenantId, experimentId)), {
    steps,
    updatedBy: editor,
    updatedAt: Date.now()
  });
}

/** Patch a single step's status or a single input value (R272 conveniences). */
export async function setStepStatus(
  tenantId: string,
  experimentId: string,
  steps: ProtocolInstanceStep[],
  stepId: string,
  status: ProtocolStepStatus
): Promise<void> {
  const next = steps.map((s) => (s.id === stepId ? { ...s, status } : s));
  await updateInstanceSteps(tenantId, experimentId, next);
}

export async function setStepInputs(
  tenantId: string,
  experimentId: string,
  steps: ProtocolInstanceStep[],
  stepId: string,
  inputs: ProtocolInput[]
): Promise<void> {
  const next = steps.map((s) => (s.id === stepId ? { ...s, inputs } : s));
  await updateInstanceSteps(tenantId, experimentId, next);
}
