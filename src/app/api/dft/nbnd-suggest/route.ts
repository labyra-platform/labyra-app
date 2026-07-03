/**
 * POST /api/dft/nbnd-suggest — minimum nbnd from valence electrons (Σ z_valence
 * of the assigned UPFs) for a structure. Auth + tenant; proxies worker. @phase R366
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { suggestDftNbnd } from '@/lib/dft/worker-client';

const schema = z.object({
  structure: z.unknown(),
  pseudoMap: z.record(z.string(), z.string()),
  nspin: z.number().optional()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const result = await suggestDftNbnd({
    tenantId,
    structure: parsed.data.structure,
    pseudoMap: parsed.data.pseudoMap,
    nspin: parsed.data.nspin
  });
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json({ error: data?.detail ?? 'Worker error' }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
