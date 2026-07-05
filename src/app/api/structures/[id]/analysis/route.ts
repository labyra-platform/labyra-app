/**
 * GET /api/structures/[id]/analysis — full crystallographic summary (symmetry,
 * Wyckoff, density, dimensionality, oxidation) for the structure detail panel.
 * Cached on the doc after first compute. Auth + tenant. @phase R387
 */
import { NextResponse } from 'next/server';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { analyzeStructure } from '@/lib/dft/worker-client';
import { attachAnalysis, getCrystalStructure } from '@/lib/firebase/crystal-structures/service';
import type { StructureAnalysis } from '@/types/crystal-structure';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const { id } = await params;
  const cs = await getCrystalStructure(tenantId, id);
  if (!cs) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (cs.analysis) return NextResponse.json(cs.analysis);

  const result = await analyzeStructure(cs.structure);
  const analysis = result.ok ? (result.data as StructureAnalysis) : null;
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json({ error: data?.detail ?? 'Analysis failed' }, { status: 502 });
  }
  await attachAnalysis(tenantId, id, analysis ?? undefined).catch(() => {});
  return NextResponse.json(analysis);
}
