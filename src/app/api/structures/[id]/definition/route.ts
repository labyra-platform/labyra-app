/**
 * POST /api/structures/[id]/definition — turn a library crystalStructure into a
 * composer seed: its DftStructure + a sensible DEFAULT global (prefix from the
 * reduced formula, PBE, conservative cutoffs, no Hubbard U). Mirrors
 * /api/dft/definition (which seeds from an existing run) so a fresh imported
 * structure can be computed without re-entering the cell. Auth + tenant required.
 *
 * @phase R331-compute-from-library
 */
import { NextResponse } from 'next/server';
import { reducedFormula } from '@/features/crystal-structures/structure-row';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { getCrystalStructure } from '@/lib/firebase/crystal-structures/service';
import type { DftWorkflowGlobal } from '@/types/dft';

function prefixFromFormula(formula: string): string {
  const slug = formula.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return slug.length > 0 ? slug : 'material';
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const { id } = await params;
  try {
    const cs = await getCrystalStructure(tenantId, id);
    if (!cs) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const global: DftWorkflowGlobal = {
      prefix: prefixFromFormula(reducedFormula(cs.structure)),
      functional: 'pbe',
      ecutwfc: 50,
      ecutrho: 400,
      hubbard: []
    };
    return NextResponse.json({ structure: cs.structure, global });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    );
  }
}
