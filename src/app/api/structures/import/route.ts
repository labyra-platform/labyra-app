/**
 * POST /api/structures/import — build a crystal structure from CIF / POSCAR /
 * Materials Project id via the worker /dft/structure gateway, then store it as a
 * reusable CrystalStructure. Auth + tenant required.
 *
 * MP-id needs the worker's configured MP key (the app never holds it) — see the
 * worker /dft/structure fallback.
 *
 * @phase R318-crystal-structures
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reducedFormula } from '@/features/crystal-structures/structure-row';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { buildStructure, buildStructureScene, type StructureScene } from '@/lib/dft/worker-client';
import { createCrystalStructure } from '@/lib/firebase/crystal-structures/service';
import type { DftStructure } from '@/types/dft';

const schema = z.object({
  source: z.enum(['cif', 'poscar', 'mp_id']),
  cifText: z.string().optional(),
  poscarText: z.string().optional(),
  mpId: z.string().optional(),
  name: z.string().trim().max(80).optional()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const json: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { source, cifText, poscarText, mpId, name } = parsed.data;

  if (source === 'cif' && !cifText?.trim())
    return NextResponse.json({ error: 'CIF text required' }, { status: 400 });
  if (source === 'poscar' && !poscarText?.trim())
    return NextResponse.json({ error: 'POSCAR text required' }, { status: 400 });
  if (source === 'mp_id' && !mpId?.trim())
    return NextResponse.json({ error: 'Materials Project id required' }, { status: 400 });

  try {
    const result = await buildStructure({
      source,
      cif_text: cifText,
      poscar_text: poscarText,
      mp_id: mpId,
      use_primitive: true,
      prefer_ibrav: true
    });
    if (!result.ok) {
      const data = result.data as { detail?: string } | null;
      return NextResponse.json(
        { error: data?.detail ?? 'Structure build failed', status: result.status },
        { status: 502 }
      );
    }

    const structure = result.data as DftStructure & { verified?: boolean };
    const label =
      name?.trim() ||
      `${reducedFormula(structure)}${structure.spaceGroup ? ` (${structure.spaceGroup})` : ''}`;

    // Precompute the 3D render scene now (one worker call at import) so the viewer
    // loads it straight from Firestore — no per-open worker round-trip. Non-fatal:
    // if it fails, the scene route falls back to computing on demand.
    let scene: StructureScene | undefined;
    const sceneRes = await buildStructureScene(structure);
    if (sceneRes.ok) scene = sceneRes.data as StructureScene;

    const created = await createCrystalStructure(
      {
        name: label,
        source,
        mpId: source === 'mp_id' ? mpId : undefined,
        verified: structure.verified,
        structure,
        scene
      },
      { tenantId, createdBy: user.uid }
    );
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    );
  }
}
