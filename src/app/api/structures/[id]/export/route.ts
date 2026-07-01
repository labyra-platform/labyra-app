/**
 * GET /api/structures/[id]/export?fmt=cif|poscar — download CIF / POSCAR text for
 * a stored crystal structure via the worker /dft/structure/export gateway.
 * Auth + tenant required.
 *
 * @phase R327-structure-viewer
 */
import { NextResponse } from 'next/server';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { exportStructure } from '@/lib/dft/worker-client';
import { getCrystalStructure } from '@/lib/firebase/crystal-structures/service';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const fmt = new URL(request.url).searchParams.get('fmt') === 'poscar' ? 'poscar' : 'cif';
  const { id } = await params;
  const cs = await getCrystalStructure(tenantId, id);
  if (!cs) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await exportStructure(cs.structure, fmt);
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json({ error: data?.detail ?? 'Export failed' }, { status: 502 });
  }

  const { text } = result.data as { text: string };
  const ext = fmt === 'poscar' ? 'POSCAR' : 'cif';
  const base = cs.name.replace(/[^\w.-]+/g, '_') || cs.id;
  const filename = fmt === 'poscar' ? `${base}.POSCAR` : `${base}.${ext}`;
  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
