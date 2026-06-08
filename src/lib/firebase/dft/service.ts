/**
 * DFT workflow service: read-only views of computation results.
 *
 * Path: tenants/{tenantId}/dftWorkflows/{workflowId}
 *
 * Written by the Python worker (Cloud Run + Cloud Batch); the app only reads.
 * Server-only — uses Firebase Admin and scopes every query by tenantId path.
 *
 * @phase R238-dft-results-ui
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type {
  DftOverallStatus,
  DftResults,
  DftUnitSnapshot,
  DftWorkflow,
  DftWorkflowGlobal
} from '@/types/dft';

const COLLECTION = 'dftWorkflows';

function toWorkflow(id: string, data: Record<string, unknown>): DftWorkflow {
  return {
    id,
    overallStatus: (data.overallStatus as DftOverallStatus | undefined) ?? null,
    results: (data.results as DftResults | undefined) ?? null,
    snapshot: (data.snapshot as Record<string, DftUnitSnapshot> | undefined) ?? {},
    global: data.global as DftWorkflowGlobal | undefined
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
