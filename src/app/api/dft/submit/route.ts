/**
 * POST /api/dft/submit — launch a verified DFT preset on the compute backend.
 *
 * Safe-by-construction: requires auth + a tenant, and only accepts the two
 * known template ids (no arbitrary structure → no arbitrary paid jobs). The
 * full validated workflow JSON lives server-side; the client only names the run.
 *
 * @phase R240-dft-submit
 */
import { NextResponse } from 'next/server';
import ws2Payload from '@/features/computation/payloads/2h-ws2-bulk-vdw.json';
import hWo3Payload from '@/features/computation/payloads/h-wo3-bulk-pbeu.json';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { submitWorkflowToWorker } from '@/lib/dft/worker-client';
import { dftSubmitSchema } from '@/lib/schemas/dft-submit-schema';

const PAYLOADS: Record<string, unknown> = {
  'h-wo3-bulk-pbeu': hWo3Payload,
  '2h-ws2-bulk-vdw': ws2Payload
};

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

  const { templateId, workflowId, machinePreset } = parsed.data;
  const workflow = PAYLOADS[templateId];
  if (!workflow) {
    return NextResponse.json({ error: 'Unknown template' }, { status: 400 });
  }

  try {
    const result = await submitWorkflowToWorker({
      tenantId,
      workflowId,
      workflow,
      machinePreset,
      maxRunSec: MAX_RUN_SEC
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
