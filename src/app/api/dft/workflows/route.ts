/** GET /api/dft/workflows — list existing workflows (id, name, status, createdAt)
 * for the runID browser in the composer. Auth + tenant. @phase R384 */
import { NextResponse } from 'next/server';
import { getCurrentTenantId } from '@/lib/auth/server';
import { listDftWorkflows } from '@/lib/firebase/dft/service';
import { toWorkflowRow } from '@/features/computation/workflow-row';

export async function GET() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const workflows = await listDftWorkflows(tenantId);
  const rows = workflows.map(toWorkflowRow).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    createdAt: r.createdAt
  }));
  return NextResponse.json({ workflows: rows });
}
