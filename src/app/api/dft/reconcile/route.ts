/**
 * POST /api/dft/reconcile — actively poll Batch for a running workflow's stuck or
 * vanished units and fail them (so the UI stops spinning on 'running' forever).
 * Auth + tenant; proxies worker /dft/reconcile. @phase R361
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { reconcileDftWorkflow } from '@/lib/dft/worker-client';

const schema = z.object({ workflowId: z.string().trim().min(1) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const result = await reconcileDftWorkflow({ tenantId, workflowId: parsed.data.workflowId });
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json({ error: data?.detail ?? 'Worker error' }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
