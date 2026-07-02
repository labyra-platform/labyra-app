/**
 * GET /api/dft/pseudo/list — the tenant's uploaded pseudopotential UPFs.
 *
 * Requires auth + a tenant. Proxies to the worker /dft/pseudo/list so the
 * compose ATOMIC_SPECIES editor can offer per-element UPF assignment.
 *
 * @phase R344-pseudo-upload
 */
import { NextResponse } from 'next/server';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { listPseudos } from '@/lib/dft/worker-client';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  }
  const result = await listPseudos();
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json(
      { error: data?.detail ?? 'Worker error', status: result.status },
      { status: result.status }
    );
  }
  return NextResponse.json(result.data);
}
