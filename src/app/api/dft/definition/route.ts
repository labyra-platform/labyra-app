/**
 * POST /api/dft/definition — returns just the structure + global of an existing
 * run, so the composer can inherit a verified structure/global (cell, species,
 * cutoffs, functional, Hubbard U) without the client loading the whole document
 * or the units. Auth + tenant required.
 *
 * @phase R315-composer
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { getDftWorkflow } from '@/lib/firebase/dft/service';

const schema = z.object({ workflowId: z.string().trim().min(1) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const json: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const wf = await getDftWorkflow(tenantId, parsed.data.workflowId);
    if (!wf) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ structure: wf.structure, global: wf.global });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    );
  }
}
