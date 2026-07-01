/**
 * POST /api/dft/kpath — seekpath high-symmetry BZ path for a DftStructure.
 *
 * Requires auth + a tenant. Proxies to the worker /dft/kpath so the compose
 * k-path editor can offer the lattice's high-symmetry points + a default path
 * for a `bands` unit (K_POINTS {crystal_b}).
 *
 * @phase R339-kpath-editor
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { getKpath } from '@/lib/dft/worker-client';

const kpathSchema = z.object({ structure: z.unknown() });

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
  const parsed = kpathSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const result = await getKpath(parsed.data.structure);
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json(
      { error: data?.detail ?? 'Worker error', status: result.status },
      { status: result.status }
    );
  }
  return NextResponse.json(result.data);
}
