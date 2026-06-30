/**
 * POST /api/dft/clone — launch a new run from an existing workflow's definition.
 *
 * The node-graph composer was retired (R251) and templates carry only display
 * metadata, so the launchable source of truth is an existing workflow document
 * (structure + global + units). This reads that base server-side and submits it
 * under a fresh run id, so no heavy definition crosses to the client.
 *
 * @phase R305-clone-workflow
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { submitWorkflowToWorker } from '@/lib/dft/worker-client';
import { getDftWorkflow } from '@/lib/firebase/dft/service';
import { DFT_MACHINE_PRESETS } from '@/lib/schemas/dft-submit-schema';

const MAX_RUN_SEC = 10800;

const cloneSchema = z.object({
  baseWorkflowId: z.string().trim().min(1),
  newRunId: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Lowercase letters, digits and hyphens only.'),
  machinePreset: z.enum(DFT_MACHINE_PRESETS),
  /** Per-manifold Hubbard U overrides; applied only to manifolds the base has. */
  hubbard: z.array(z.object({ manifold: z.string(), value: z.number().min(0) })).optional()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const json: unknown = await request.json().catch(() => null);
  const parsed = cloneSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { baseWorkflowId, newRunId, machinePreset, hubbard } = parsed.data;

  if (newRunId === baseWorkflowId) {
    return NextResponse.json({ error: 'New run id must differ from the base.' }, { status: 400 });
  }

  const base = await getDftWorkflow(tenantId, baseWorkflowId);
  if (!base?.structure || !base.global || !base.units || base.units.length === 0) {
    return NextResponse.json({ error: 'Base workflow not found or incomplete.' }, { status: 404 });
  }

  // Apply U overrides per manifold (never introduce manifolds the base lacks).
  const overrides = new Map((hubbard ?? []).map((h) => [h.manifold, h.value]));
  const mergedGlobal = {
    ...base.global,
    hubbard: (base.global.hubbard ?? []).map((h) => ({
      ...h,
      value: overrides.get(h.manifold) ?? h.value
    }))
  };

  try {
    const result = await submitWorkflowToWorker({
      tenantId,
      workflowId: newRunId,
      workflow: { structure: base.structure, global: mergedGlobal, units: base.units },
      machinePreset,
      maxRunSec: MAX_RUN_SEC
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: 'Worker rejected submission', status: result.status },
        { status: 502 }
      );
    }
    return NextResponse.json({ workflowId: newRunId, status: 'submitted' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Clone failed' },
      { status: 500 }
    );
  }
}
