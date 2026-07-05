/** GET list / POST create DFT projects. @phase R376 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { createDftProject, listDftProjects } from '@/lib/firebase/dft/project-service';

export async function GET() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  return NextResponse.json({ projects: await listDftProjects(tenantId) });
}

const createSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  const project = await createDftProject(parsed.data, {
    tenantId,
    createdBy: user.email ?? user.uid
  });
  return NextResponse.json({ project });
}
