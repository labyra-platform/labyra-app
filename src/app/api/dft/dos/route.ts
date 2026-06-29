/**
 * POST /api/dft/dos — total + projected DOS for a workflow's dos/pdos units.
 * Auth + tenant required; proxies the worker /dft/dos. @phase R290
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { fetchDftDos } from '@/lib/dft/worker-client';

const dosSchema = z.object({
  workflowId: z.string().min(1)
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  }
  const json: unknown = await request.json().catch(() => null);
  const parsed = dosSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  try {
    const result = await fetchDftDos({ tenantId, workflowId: parsed.data.workflowId });
    if (!result.ok) {
      const data = result.data as { detail?: string } | null;
      return NextResponse.json(
        { error: data?.detail ?? 'Worker error', status: result.status },
        { status: 502 }
      );
    }
    return NextResponse.json(result.data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'DOS failed' },
      { status: 500 }
    );
  }
}
