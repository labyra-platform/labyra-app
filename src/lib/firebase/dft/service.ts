/**
 * DFT workflow service: read-only views of computation results.
 *
 * Path: tenants/{tenantId}/dftWorkflows/{workflowId}
 *
 * Written by the Python worker (Cloud Run + Cloud Batch); the app only reads.
 * Server-only — uses Firebase Admin and scopes every query by tenantId path.
 *
 * NOTE: the worker stores `structure` as a JSON STRING (nested arrays like
 * cellParameters aren't valid Firestore entities), so we decode it on read —
 * mirroring the worker's own load(). `units`/`global` are stored as native maps.
 *
 * @phase R260-parse-structure-json
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type {
  DftOverallStatus,
  DftResults,
  DftStructure,
  DftUnit,
  DftUnitSnapshot,
  DftWorkflow,
  DftWorkflowGlobal
} from '@/types/dft';
const COLLECTION = 'dftWorkflows';

/** Structure is persisted as a JSON string by the worker; decode it. */
function parseStructure(raw: unknown): DftStructure | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    if (raw.length === 0) return undefined;
    try {
      return JSON.parse(raw) as DftStructure;
    } catch {
      return undefined;
    }
  }
  return raw as DftStructure;
}

function toWorkflow(id: string, data: Record<string, unknown>): DftWorkflow {
  return {
    id,
    overallStatus: (data.overallStatus as DftOverallStatus | undefined) ?? null,
    results: (data.results as DftResults | undefined) ?? null,
    snapshot: (data.snapshot as Record<string, DftUnitSnapshot> | undefined) ?? {},
    structure: parseStructure(data.structure),
    global: data.global as DftWorkflowGlobal | undefined,
    units: data.units as DftUnit[] | undefined,
    createdAt: toMillis(data.createdAt),
    createdBy: (data.createdBy as string | undefined) ?? null
  };
}

/** Firestore Timestamp | number | ISO string → epoch ms, or null. */
function toMillis(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : t;
  }
  const ts = raw as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const secs = ts._seconds ?? ts.seconds;
  return typeof secs === 'number' ? secs * 1000 : null;
}
export async function getDftWorkflow(
  tenantId: string,
  workflowId: string
): Promise<DftWorkflow | null> {
  const db = getAdminFirestoreService();
  const snap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(workflowId)
    .get();
  if (!snap.exists) return null;
  return toWorkflow(snap.id, snap.data() ?? {});
}
export async function listDftWorkflows(tenantId: string): Promise<DftWorkflow[]> {
  const db = getAdminFirestoreService();
  const qs = await db.collection('tenants').doc(tenantId).collection(COLLECTION).get();
  return qs.docs.map((d) => toWorkflow(d.id, d.data() ?? {}));
}

/** Hard-delete a workflow document (no lifecycle field on DftWorkflow). GCS
 * artifacts are not touched here — they age out with the bucket lifecycle. */
export async function deleteDftWorkflow(tenantId: string, id: string): Promise<void> {
  const db = getAdminFirestoreService();
  await db.collection('tenants').doc(tenantId).collection(COLLECTION).doc(id).delete();
}
