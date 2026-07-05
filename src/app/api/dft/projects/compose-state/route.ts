/** GET list compose states for a project / POST save one. @phase R376 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { listComposeStates, saveComposeState } from '@/lib/firebase/dft/project-service';

export async function GET(request: Request) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  return NextResponse.json({ states: await listComposeStates(tenantId, projectId) });
}

const saveSchema = z.object({
  projectId: z.string().trim().min(1),
  structureId: z.string().trim().min(1),
  runId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{2,63}$/, 'runId must be 3–64 lowercase alphanumeric/hyphen'),
  nodes: z.unknown(),
  global: z.unknown(),
  selectedId: z.string().nullable().optional()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid' },
      { status: 400 }
    );
  }
  try {
    const { updatedAt } = await saveComposeState(tenantId, parsed.data);
    return NextResponse.json({ updatedAt });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
