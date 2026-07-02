/**
 * POST /api/dft/avgpot — planar/macroscopic-averaged potential V(z) from an
 * avgpot unit's avg.dat. Auth + tenant; proxies worker. @phase R357
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { fetchDftAvgpot } from '@/lib/dft/worker-client';

const schema = z.object({ workflowId: z.string().min(1), unitId: z.string().min(1).optional() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const json: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    const result = await fetchDftAvgpot({ tenantId, ...parsed.data });
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
      { error: err instanceof Error ? err.message : 'Avgpot failed' },
      { status: 500 }
    );
  }
}
