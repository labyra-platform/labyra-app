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
    units: data.units as DftUnit[] | undefined
  };
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
