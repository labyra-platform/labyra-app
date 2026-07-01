/**
 * DELETE /api/dft/workflows/[id] — hard-delete a DFT workflow document.
 * Auth + tenant required. Used by the computation list row kebab + bulk delete.
 *
 * @phase R321-job-kebab-bulk
 */
import { NextResponse } from 'next/server';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { deleteDftWorkflow } from '@/lib/firebase/dft/service';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const { id } = await params;
  try {
    await deleteDftWorkflow(tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
