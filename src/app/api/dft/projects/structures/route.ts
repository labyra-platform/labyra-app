/** POST attach/detach a structure to a project. @phase R376 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { setProjectStructure } from '@/lib/firebase/dft/project-service';

const schema = z.object({
  projectId: z.string().trim().min(1),
  structureId: z.string().trim().min(1),
  attach: z.boolean()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  await setProjectStructure(
    tenantId,
    parsed.data.projectId,
    parsed.data.structureId,
    parsed.data.attach
  );
  return NextResponse.json({ ok: true });
}
