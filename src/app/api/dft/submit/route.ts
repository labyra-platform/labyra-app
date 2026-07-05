/**
 * POST /api/dft/submit — launch a user-composed DFT workflow on the backend.
 *
 * Requires auth + a tenant. The body is the editor's serialized workflow
 * (structure + global + units); the worker validates QE specifics and runs it
 * on Cloud Batch.
 *
 * @phase R245-dag-editor-b4-serialize
 */
import { NextResponse } from 'next/server';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { submitWorkflowToWorker } from '@/lib/dft/worker-client';
import { dftSubmitSchema } from '@/lib/schemas/dft-submit-schema';

const MAX_RUN_SEC = 10800;

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
  const parsed = dftSubmitSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { workflowId, machinePreset, workflow } = parsed.data;
  try {
    const result = await submitWorkflowToWorker({
      tenantId,
      workflowId,
      workflow,
      machinePreset,
      maxRunSec: MAX_RUN_SEC,
      createdBy: user.name ?? user.email ?? user.uid
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: 'Worker rejected submission', status: result.status },
        { status: 502 }
      );
    }
    return NextResponse.json({ workflowId, status: 'submitted' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Submit failed' },
      { status: 500 }
    );
  }
}
