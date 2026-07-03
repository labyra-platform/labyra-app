/**
 * POST /api/dft/cancel — stop a running workflow, or a single unit, by cancelling
 * its Batch job(s) (releases the VM) and failing the unit(s). Auth + tenant;
 * proxies worker /dft/cancel. @phase R362
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { cancelDftWorkflow } from '@/lib/dft/worker-client';

const schema = z.object({
  workflowId: z.string().trim().min(1),
  unitId: z.string().trim().min(1).optional()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const result = await cancelDftWorkflow({
    tenantId,
    workflowId: parsed.data.workflowId,
    unitId: parsed.data.unitId
  });
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json({ error: data?.detail ?? 'Worker error' }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
